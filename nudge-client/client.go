package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/timer"
	tea "github.com/charmbracelet/bubbletea"
	lipglossV1 "github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/v2"
	libs "outercloud.dev/nudge/nudge-libs"
)

var logo = `███╗   ██╗██╗   ██╗██████╗  ██████╗ ███████╗
████╗  ██║██║   ██║██╔══██╗██╔════╝ ██╔════╝
██╔██╗ ██║██║   ██║██║  ██║██║  ███╗█████╗  
██║╚██╗██║██║   ██║██║  ██║██║   ██║██╔══╝  
██║ ╚████║╚██████╔╝██████╔╝╚██████╔╝███████╗
╚═╝  ╚═══╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝`

var defaultMaps = "DefaultLarge,DefaultMedium,DefaultSmall,Meow,Nofreecheese,ZeroDay,arrows,cheesefarm,cheeseguardians,combat-test,dirtfulcat,dirtpassageway,evileye,keepout,pipes,popthecork,rift,sittingducks,starvation,thunderdome,trapped,wallsofparadis"

var borderStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(lipgloss.Color("#8353fc")).
	PaddingRight(2).
	PaddingLeft(2).
	PaddingTop(1).
	PaddingBottom(1)

var borderStyleNoBotPad = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(lipgloss.Color("#8353fc")).
	PaddingRight(2).
	PaddingLeft(2).
	PaddingTop(1)

type Config struct {
	Address string `json:"address"`
	BotA    string `json:"botA"`
	BotB    string `json:"botB"`
	Maps    string `json:"maps"`
	Games   int    `json:"games"`
}

func getConfigPath() (string, error) {
	configDirectory, err := os.UserConfigDir()

	if err != nil {
		return "", err
	}

	appDirectory := filepath.Join(configDirectory, "nudge")

	os.MkdirAll(appDirectory, 0755)

	return filepath.Join(appDirectory, "config.json"), nil
}

func loadConfig() (*Config, error) {
	path, err := getConfigPath()
	if err != nil {
		return nil, err
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &Config{
			Address: "localhost:8000",
			BotA:    "sprint_1",
			BotB:    "v2",
			Maps:    defaultMaps,
			Games:   200,
		}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	err = json.Unmarshal(data, &config)

	return &config, err
}

func saveConfig(config *Config) error {
	path, err := getConfigPath()
	if err != nil {
		return err
	}

	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

func main() {
	logFile, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)

	if err != nil {
		log.Fatal(err)
	}

	defer logFile.Close()

	log.SetOutput(logFile)

	log.Println("Nudge Client started...")

	model := createModel()

	defer func() {
		if model.cmd != nil && model.cmd.Process != nil {
			log.Println("Cleaning up process...")
			model.cmd.Process.Kill()
		}
	}()

	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}
}

type (
	errMsg     error
	processMsg string
)

type keyMap struct {
	Quit key.Binding
}

func (k keyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Quit}
}

func (k keyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Quit},
	}
}

type historyEntry struct {
	label string

	botA string
	botB string

	winsA int
	winsB int
}

type model struct {
	config *Config

	state string

	width  int
	height int

	history []historyEntry

	cmd     *exec.Cmd
	lines   chan string
	log     string
	ipcPort int

	address string

	label string
	botA  string
	botB  string
	maps  string
	games int

	infoState string

	etaReceived bool

	textInput   textinput.Model
	spinner     spinner.Model
	progress    progress.Model
	timer       timer.Model
	logTextArea textarea.Model
	help        help.Model

	err error
}

func createModel() model {
	config, _ := loadConfig()

	textInput := textinput.New()
	textInput.Placeholder = "localhost:8000"
	textInput.Focus()
	textInput.CharLimit = 1000
	textInput.Width = 20

	if config != nil {
		textInput.Placeholder = config.Address
	}

	connectingSpinner := spinner.New()
	connectingSpinner.Spinner = spinner.Dot
	connectingSpinner.Style = lipglossV1.NewStyle().Foreground(lipglossV1.Color("#ff4d93"))

	return model{
		config: config,

		state: "unconnected",

		history: []historyEntry{},

		etaReceived: false,

		textInput: textInput,
		spinner:   connectingSpinner,

		progress: progress.New(progress.WithDefaultGradient()),
		timer:    timer.NewWithInterval(time.Second, time.Second),

		help: help.New(),

		err: nil,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(textinput.Blink, m.timer.Init())
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		m.textInput.Width = m.width - 10
		m.progress.Width = m.width - 18

	case tea.KeyMsg:
		switch msg.Type {

		case tea.KeyCtrlC:
			if m.cmd != nil && m.cmd.Process != nil {
				log.Println("Cleaning up process...")
				m.cmd.Process.Kill()
			}

			return m, tea.Quit

		case tea.KeyEsc:
			switch m.state {
			case "info":
				switch m.infoState {
				case "label":
					m.state = "ready"
				case "botA":
					m.infoState = "label"

					m.textInput.SetValue(m.label)
					m.textInput.Placeholder = "Unamed Run"
				case "botB":
					m.infoState = "botA"

					m.textInput.SetValue(m.botA)
					m.textInput.Placeholder = m.config.BotA
				case "maps":
					m.infoState = "botB"

					m.textInput.SetValue(m.botB)
					m.textInput.Placeholder = m.config.BotB
				case "games":
					m.infoState = "maps"

					m.textInput.SetValue(m.maps)
					m.textInput.Placeholder = m.config.Maps
				}
			}

		case tea.KeyEnter:
			switch m.state {

			case "unconnected":
				m.address = m.textInput.Value()

				if m.address == "" {
					m.address = m.textInput.Placeholder
				}

				m.config.Address = m.address

				saveConfig(m.config)

				m.state = "connecting"

				cmd, lines := startProcess()

				m.cmd = cmd
				m.lines = lines

				return m, tea.Batch(m.spinner.Tick, waitForLine(m.lines))

			case "ready":
				m.state = "info"
				m.infoState = "label"

				m.textInput.SetValue("")
				m.textInput.Placeholder = "Unamed Run"

				return m, textinput.Blink

			case "info":
				switch m.infoState {
				case "label":
					m.label = m.textInput.Value()

					if m.textInput.Value() == "" {
						m.label = m.textInput.Placeholder
					}

					m.infoState = "botA"

					m.textInput.SetValue("")
					m.textInput.Placeholder = m.config.BotA
				case "botA":
					m.botA = m.textInput.Value()

					if m.textInput.Value() == "" {
						m.botA = m.textInput.Placeholder
					}

					m.infoState = "botB"

					m.textInput.SetValue("")
					m.textInput.Placeholder = m.config.BotB
				case "botB":
					m.botB = m.textInput.Value()

					if m.textInput.Value() == "" {
						m.botB = m.textInput.Placeholder
					}

					m.infoState = "maps"

					m.textInput.SetValue("")
					m.textInput.Placeholder = m.config.Maps
				case "maps":
					m.maps = m.textInput.Value()

					if m.textInput.Value() == "" {
						m.maps = m.textInput.Placeholder
					}

					m.infoState = "games"

					m.textInput.SetValue("")
					m.textInput.Placeholder = strconv.Itoa(m.config.Games)
				case "games":
					m.games, _ = strconv.Atoi(m.textInput.Value())

					if m.textInput.Value() == "" {
						m.games, _ = strconv.Atoi(m.textInput.Placeholder)
					}

					if m.games > 0 {
						m.config.BotA = m.botA
						m.config.BotB = m.botB
						m.config.Maps = m.maps
						m.config.Games = m.games

						saveConfig(m.config)

						go sendRunMessage(m)

						m.state = "running"
						m.etaReceived = false
					}
				}
			}

		}

	case processMsg:
		text := string(msg)

		if strings.Contains(text, "[msg->ipc]") {
			index := strings.Index(text, "[msg->ipc]")

			result, _ := strconv.Atoi(text[index+len("[msg->ipc]"):])

			m.ipcPort = result

			log.Println("Set IPC port " + strconv.Itoa(result))

			if m.state == "connecting" {
				go sendConnectMessage(m)
			}
		} else if strings.Contains(text, "[msg->status]") {
			index := strings.Index(text, "[msg->status]")

			state := text[index+len("[msg->status]"):]

			if state == "idle" {
				m.state = "ready"
			} else {
				m.state = "waiting"
			}
		} else if strings.Contains(text, "[msg->connected]") {
			m.state = "ready"
		} else if strings.Contains(text, "[msg->disconnected]") {
			m.state = "connecting"

			return m, tea.Batch(m.spinner.Tick, waitForLine(m.lines))
		} else if strings.Contains(text, "[msg->begin]") {
			m.etaReceived = false

			m.state = "running"
		} else if strings.Contains(text, "[msg->complete]") {
			m.state = "ready"

			m.progress = progress.New(progress.WithDefaultGradient())
			m.progress.Width = m.width - 18
		} else if strings.Contains(text, "[msg->eta]") {
			index := strings.Index(text, "[msg->eta]")

			eta, _ := strconv.ParseFloat(text[index+len("[msg->eta]"):], 64)

			m.timer = timer.NewWithInterval(time.Duration(eta*float64(time.Second)).Truncate(time.Second), time.Second)

			m.etaReceived = true

			return m, tea.Batch(waitForLine(m.lines), m.timer.Init())
		} else if strings.Contains(text, "[msg->progress]") {
			index := strings.Index(text, "[msg->progress]")

			progress, _ := strconv.ParseFloat(text[index+len("[msg->progress]"):], 64)

			cmd = m.progress.SetPercent(progress)

			return m, tea.Batch(waitForLine(m.lines), cmd)
		} else if strings.Contains(text, "[msg->history]") {
			labelIndex := strings.Index(text, "[msg->history]")
			botAIndex := strings.Index(text, "[botA]")
			botBIndex := strings.Index(text, "[botB]")
			winsAIndex := strings.Index(text, "[winsA]")
			winsBIndex := strings.Index(text, "[winsB]")

			label := text[labelIndex+len("[msg->history]") : botAIndex]
			botA := text[botAIndex+len("[botA]") : botBIndex]
			botB := text[botBIndex+len("[botB]") : winsAIndex]
			winsA, _ := strconv.Atoi(text[winsAIndex+len("[winsA]") : winsBIndex])
			winsB, _ := strconv.Atoi(text[winsBIndex+len("[winsB]"):])

			m.history = append(m.history, historyEntry{
				label: label,
				botA:  botA,
				botB:  botB,
				winsA: winsA,
				winsB: winsB,
			})
		} else {
			m.log = m.log + lipgloss.NewStyle().Foreground(lipgloss.Color("#ff4d93")).Render("[Client] ") + text + "\n"
		}

		return m, waitForLine(m.lines)

	case timer.TickMsg:
		m.timer, cmd = m.timer.Update(msg)
		return m, cmd

	case progress.FrameMsg:
		progressModel, cmd := m.progress.Update(msg)
		m.progress = progressModel.(progress.Model)
		return m, cmd

	case errMsg:
		m.err = msg
		return m, nil
	}

	switch m.state {
	case "unconnected":
		m.textInput, cmd = m.textInput.Update(msg)

	case "connecting":
		m.spinner, cmd = m.spinner.Update(msg)

	case "info":
		m.textInput, cmd = m.textInput.Update(msg)
	}

	return m, cmd
}

func sendConnectMessage(model model) {
	_, err := http.Post("http://localhost:"+strconv.Itoa(model.ipcPort)+"/connect", "text/plain", bytes.NewBufferString(model.address))
	if err != nil {
		fmt.Println("Error:", err)
	}
}

func sendRunMessage(model model) {
	data := map[string]interface{}{
		"label": model.label,
		"botA":  model.botA,
		"botB":  model.botB,
		"maps":  model.maps,
		"games": model.games,
	}

	jsonData, err := json.Marshal(data)

	if err != nil {
		fmt.Println("Error:", err)

		return
	}

	_, err = http.Post("http://localhost:"+strconv.Itoa(model.ipcPort)+"/run", "application/json", bytes.NewBuffer(jsonData))

	if err != nil {
		fmt.Println("Error:", err)

		return
	}
}

func startProcess() (*exec.Cmd, chan string) {
	log.Println("Starting process...")

	lines := make(chan string, 100)

	cmd := exec.Command("deno", "run", "--allow-all", "./nudge-client/client.ts")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Println("Stdout err!")

		return nil, nil
	}

	stderr, err := cmd.StderrPipe() // ADD THIS - capture errors too
	if err != nil {
		log.Println("Stderr err:", err)
		return nil, nil
	}

	if err := cmd.Start(); err != nil {
		log.Println("Start err!")

		return nil, nil
	}

	log.Println("Started process.")

	go func() {
		scanner := bufio.NewScanner(stdout)

		for scanner.Scan() {
			text := scanner.Text()

			log.Println("Process message: " + text)

			lines <- text
		}

		log.Println("stdout scanner finished")
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)

		for scanner.Scan() {
			text := scanner.Text()

			log.Println("Process err: " + text)

			lines <- text
		}

		log.Println("stderr scanner finished")
	}()

	return cmd, lines
}

func waitForLine(lines <-chan string) tea.Cmd {
	return func() tea.Msg {
		line, ok := <-lines
		if !ok {
			return nil
		}
		return processMsg(line)
	}
}

func (m model) View() string {
	if m.width == 0 {
		return "Loading..."
	}

	content := ""

	content += libs.RenderGradientForegroundStyled(
		"Client",
		lipgloss.NewStyle().Bold(true),
		lipgloss.Color("#ff4d93"),
		lipgloss.Color("#f54b9b"),
	) + "\n"

	content += libs.RenderGradientForeground(
		logo,
		lipgloss.Color("#ff4d93"),
		lipgloss.Color("#9d3beb"),
	) + "\n"

	if m.state == "ready" || m.state == "running" || m.state == "waiting" || m.state == "info" {
		content += "\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("#ff4d93")).Bold(true).Render("Connected to Server: ") + m.address + "\n\n"
	}

	help := m.help.View(keyMap{
		Quit: key.NewBinding(
			key.WithKeys("ctrl+c"),
			key.WithHelp("ctrl+c", "quit"),
		),
	})

	helpHeight := strings.Count(help, "\n")

	switch m.state {
	case "unconnected":
		content += "\n" + borderStyle.Render(fmt.Sprintf(
			"Enter server address:\n%s",
			m.textInput.View(),
		))

	case "connecting":
		content += "\n" + m.spinner.View() + " Connecting...\n\n"

	case "waiting":
		content += borderStyle.Width(m.width).Render(lipgloss.Place(m.width-6, 1, lipgloss.Center, lipgloss.Center, "A run is currently in progress. Please wait for it to finish.")) + "\n"

		content += "\n" + m.progress.View() + "  "

		if m.etaReceived {
			content += "Eta: " + m.timer.View()
		} else {
			content += "Eta: Unkown"
		}

		content += "\n\n"

	case "running":
		content += m.progress.View() + "  "

		if m.etaReceived {
			content += "Eta: " + m.timer.View()
		} else {
			content += "Eta: Unkown"
		}

		content += "\n\n"

	case "ready":
		content += borderStyle.Width(m.width).Render(lipgloss.Place(m.width-6, 1, lipgloss.Center, lipgloss.Center, "Welcome :D Hit enter to begin.")) + "\n"

		if len(m.history) > 0 {
			historyContent := ""

			historyContent += "History:\n"

			history := m.history

			if len(history) > 3 {
				history = history[len(history)-3:]
			}

			for _, value := range history {
				winRate := float64(value.winsA) / (float64(value.winsA) + float64(value.winsB))
				winRatePercent := int(math.Round(winRate * 100))
				delta := winRatePercent - 50
				games := value.winsA + value.winsB
				stdError := math.Sqrt(winRate * (1 - winRate) / float64(games))
				errorMargin := stdError * 1.96
				errorPercent := int(math.Round(errorMargin * 100))

				historyContent += lipgloss.NewStyle().Foreground(lipgloss.Color("#ff4d93")).Render("\""+value.label+"\"") + "   " + value.botA + " vs " + value.botB + "   " + strconv.Itoa(value.winsA) + "-" + strconv.Itoa(value.winsB) + "   " + strconv.Itoa(winRatePercent) + "%   Δ" + strconv.Itoa(delta) + "%   ±" + strconv.Itoa(errorPercent) + "%\n"
			}

			content += borderStyleNoBotPad.Width(m.width).Render(historyContent) + "\n"
		}

	case "info":
		inputContent := "Enter run information:\n"

		if m.infoState != "label" {
			inputContent += "Label: " + m.label + "\n"
		}

		if m.infoState != "label" && m.infoState != "botA" {
			inputContent += "Bot A: " + m.botA + "\n"
		}

		if m.infoState != "label" && m.infoState != "botA" && m.infoState != "botB" {
			inputContent += "Bot B: " + m.botB + "\n"
		}

		if m.infoState != "label" && m.infoState != "botA" && m.infoState != "botB" && m.infoState != "maps" {
			inputContent += "Maps: " + m.maps + "\n"
		}

		switch m.infoState {
		case "label":
			inputContent += "Label "
		case "botA":
			inputContent += "Bot A "
		case "botB":
			inputContent += "Bot B "
		case "maps":
			inputContent += "Maps "
		case "games":
			inputContent += "Games "
		}

		inputContent += m.textInput.View()

		content += borderStyle.Width(m.width).Render(inputContent) + "\n"
	}

	contentHeight := strings.Count(content, "\n")

	if m.state != "unconnected" {
		boxHeight := m.height - contentHeight - helpHeight - 6

		if boxHeight > 1 {
			logContent := lipgloss.NewStyle().
				Width(m.width - 6).
				Height(boxHeight).
				Render(m.log)

			logLines := strings.Split(logContent, "\n")

			startLine := 0

			if len(logLines) > boxHeight {
				startLine = len(logLines) - boxHeight
			}

			truncatedLog := strings.Join(logLines[startLine:], "\n")

			content += borderStyleNoBotPad.Render(
				lipgloss.NewStyle().Bold(true).Render("Log:") + "\n" + truncatedLog,
			)
		}
	}

	contentHeight = strings.Count(content, "\n")

	result := content + strings.Repeat("\n", m.height-contentHeight-helpHeight-1) + help

	return result
}
