package main

import (
	"bufio"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss/v2"
	libs "outercloud.dev/nudge/nudge-libs"
)

var logo = `███╗   ██╗██╗   ██╗██████╗  ██████╗ ███████╗
████╗  ██║██║   ██║██╔══██╗██╔════╝ ██╔════╝
██╔██╗ ██║██║   ██║██║  ██║██║  ███╗█████╗  
██║╚██╗██║██║   ██║██║  ██║██║   ██║██╔══╝  
██║ ╚████║╚██████╔╝██████╔╝╚██████╔╝███████╗
╚═╝  ╚═══╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝`

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

func main() {
	logFile, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)

	if err != nil {
		log.Fatal(err)
	}

	defer logFile.Close()

	log.SetOutput(logFile)

	log.Println("Nudge Server started...")

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

type model struct {
	state string

	width  int
	height int

	cmd   *exec.Cmd
	lines chan string
	log   string

	clients int

	help help.Model

	err error
}

func createModel() model {
	cmd, lines := startProcess()

	return model{
		state: "main",

		cmd:   cmd,
		lines: lines,

		clients: 0,

		help: help.New(),

		err: nil,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		textinput.Blink,
		waitForLine(m.lines),
	)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			if m.cmd != nil && m.cmd.Process != nil {
				log.Println("Cleaning up process...")
				m.cmd.Process.Kill()
			}

			return m, tea.Quit
		}

	case processMsg:
		text := string(msg)

		if strings.Contains(text, "[msg->clients]") {
			index := strings.Index(text, "[msg->clients]")

			result, _ := strconv.Atoi(text[index+len("[msg->clients]"):])

			m.clients = result
		} else {
			m.log = m.log + lipgloss.NewStyle().Foreground(lipgloss.Color("#ff4d93")).Render("[Server] ") + text + "\n"
		}

		return m, waitForLine(m.lines)

	case errMsg:
		m.err = msg

		return m, nil
	}

	switch m.state {
	}

	return m, cmd
}

func startProcess() (*exec.Cmd, chan string) {
	log.Println("Starting process...")

	lines := make(chan string, 100)

	cmd := exec.Command("deno", "run", "--allow-all", "./nudge-server/server.ts")

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
		"Server",
		lipgloss.NewStyle().Bold(true),
		lipgloss.Color("#ff4d93"),
		lipgloss.Color("#f54b9b"),
	) + "\n"

	content += libs.RenderGradientForeground(
		logo,
		lipgloss.Color("#ff4d93"),
		lipgloss.Color("#9d3beb"),
	) + "\n"

	content += "\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("#ff4d93")).Bold(true).Render("Online Clients: ") + strconv.Itoa(m.clients) + "\n\n"

	headerHeight := strings.Count(content, "\n")

	help := m.help.View(keyMap{
		Quit: key.NewBinding(
			key.WithKeys("ctrl+c"),
			key.WithHelp("ctrl+c", "quit"),
		),
	})

	helpHeight := strings.Count(help, "\n")

	switch m.state {
	case "main":
		boxHeight := m.height - headerHeight - helpHeight - 6

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

	contentHeight := strings.Count(content, "\n")

	result := content + strings.Repeat("\n", m.height-contentHeight-helpHeight-1) + help

	return result
}

/*

 _____ _____ ____  _____ _____
|   | |  |  |    \|   __|   __|
| | | |  |  |  |  |  |  |   __|
|_|___|_____|____/|_____|_____|

   _  ____  _____  _________
  / |/ / / / / _ \/ ___/ __/
 /    / /_/ / // / (_ / _/
/_/|_/\____/____/\___/___/

 __   __     __  __     _____     ______     ______
/\ "-.\ \   /\ \/\ \   /\  __-.  /\  ___\   /\  ___\
\ \ \-.  \  \ \ \_\ \  \ \ \/\ \ \ \ \__ \  \ \  __\
 \ \_\\"\_\  \ \_____\  \ \____-  \ \_____\  \ \_____\
  \/_/ \/_/   \/_____/   \/____/   \/_____/   \/_____/


░███    ░██ ░██     ░██ ░███████     ░██████  ░██████████
░████   ░██ ░██     ░██ ░██   ░██   ░██   ░██ ░██
░██░██  ░██ ░██     ░██ ░██    ░██ ░██        ░██
░██ ░██ ░██ ░██     ░██ ░██    ░██ ░██  █████ ░█████████
░██  ░██░██ ░██     ░██ ░██    ░██ ░██     ██ ░██
░██   ░████  ░██   ░██  ░██   ░██   ░██  ░███ ░██
░██    ░███   ░██████   ░███████     ░█████░█ ░██████████


  _   _  _    _  _____    _____  ______
 | \ | || |  | ||  __ \  / ____||  ____|
 |  \| || |  | || |  | || |  __ | |__
 | . ` || |  | || |  | || | |_ ||  __|
 | |\  || |__| || |__| || |__| || |____
 |_| \_| \____/ |_____/  \_____||______|


  ________   ___  ___  ________  ________  _______
|\   ___  \|\  \|\  \|\   ___ \|\   ____\|\  ___ \
\ \  \\ \  \ \  \\\  \ \  \_|\ \ \  \___|\ \   __/|
 \ \  \\ \  \ \  \\\  \ \  \ \\ \ \  \  __\ \  \_|/__
  \ \  \\ \  \ \  \\\  \ \  \_\\ \ \  \|\  \ \  \_|\ \
   \ \__\\ \__\ \_______\ \_______\ \_______\ \_______\
    \|__| \|__|\|_______|\|_______|\|_______|\|_______|


███    ██ ██    ██ ██████   ██████  ███████
████   ██ ██    ██ ██   ██ ██       ██
██ ██  ██ ██    ██ ██   ██ ██   ███ █████
██  ██ ██ ██    ██ ██   ██ ██    ██ ██
██   ████  ██████  ██████   ██████  ███████


███╗   ██╗██╗   ██╗██████╗  ██████╗ ███████╗
████╗  ██║██║   ██║██╔══██╗██╔════╝ ██╔════╝
██╔██╗ ██║██║   ██║██║  ██║██║  ███╗█████╗
██║╚██╗██║██║   ██║██║  ██║██║   ██║██╔══╝
██║ ╚████║╚██████╔╝██████╔╝╚██████╔╝███████╗
╚═╝  ╚═══╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝

::::    ::: :::    ::: :::::::::   ::::::::  ::::::::::
:+:+:   :+: :+:    :+: :+:    :+: :+:    :+: :+:
:+:+:+  +:+ +:+    +:+ +:+    +:+ +:+        +:+
+#+ +:+ +#+ +#+    +:+ +#+    +:+ :#:        +#++:++#
+#+  +#+#+# +#+    +#+ +#+    +#+ +#+   +#+# +#+
#+#   #+#+# #+#    #+# #+#    #+# #+#    #+# #+#
###    ####  ########  #########   ########  ##########

*/
