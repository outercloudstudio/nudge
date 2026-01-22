package libs

import (
	"fmt"
	"image/color"
	"strings"

	"github.com/charmbracelet/lipgloss/v2"
)

func interpolateColor(c1, c2 color.Color, t float64) color.Color {
	r1, g1, b1, _ := c1.RGBA()
	r2, g2, b2, _ := c2.RGBA()

	r := uint8((float64(r1>>8) + (float64(r2>>8)-float64(r1>>8))*t))
	g := uint8((float64(g1>>8) + (float64(g2>>8)-float64(g1>>8))*t))
	b := uint8((float64(b1>>8) + (float64(b2>>8)-float64(b1>>8))*t))

	return color.RGBA{R: r, G: g, B: b, A: 255}
}

func Blend1D(steps int, colors ...color.Color) []color.Color {
	if steps <= 0 {
		return []color.Color{}
	}
	if steps == 1 {
		return []color.Color{colors[0]}
	}
	if len(colors) == 0 {
		return make([]color.Color, steps)
	}
	if len(colors) == 1 {
		result := make([]color.Color, steps)
		for i := range result {
			result[i] = colors[0]
		}
		return result
	}

	result := make([]color.Color, steps)
	segmentSize := float64(steps-1) / float64(len(colors)-1)

	for i := 0; i < steps; i++ {
		position := float64(i) / segmentSize
		segmentIndex := int(position)

		if segmentIndex >= len(colors)-1 {
			result[i] = colors[len(colors)-1]
			continue
		}

		t := position - float64(segmentIndex)
		result[i] = interpolateColor(colors[segmentIndex], colors[segmentIndex+1], t)
	}

	return result
}

func RenderGradientForeground(content string, colors ...color.Color) string {
	lines := strings.Split(content, "\n")

	maxLength := 0

	for _, line := range lines {
		if len(line) > maxLength {
			maxLength = len(line)
		}
	}

	gradientColors := Blend1D(
		maxLength,
		colors...,
	)

	var result strings.Builder

	for lineIndex, line := range lines {
		for i, char := range line {
			c := gradientColors[i]
			r, g, b, _ := c.RGBA()
			hexColor := lipgloss.Color(fmt.Sprintf("#%02x%02x%02x", r>>8, g>>8, b>>8))

			style := lipgloss.NewStyle().Foreground(hexColor)

			result.WriteString(style.Render(string(char)))
		}

		if lineIndex < len(lines)-1 {
			result.WriteString("\n")
		}
	}

	return result.String()
}

func RenderGradientForegroundStyled(content string, base lipgloss.Style, colors ...color.Color) string {
	lines := strings.Split(content, "\n")

	maxLength := 0

	for _, line := range lines {
		if len(line) > maxLength {
			maxLength = len(line)
		}
	}

	gradientColors := Blend1D(
		maxLength,
		colors...,
	)

	var result strings.Builder

	for lineIndex, line := range lines {
		for i, char := range line {
			c := gradientColors[i]
			r, g, b, _ := c.RGBA()
			hexColor := lipgloss.Color(fmt.Sprintf("#%02x%02x%02x", r>>8, g>>8, b>>8))

			style := base.Foreground(hexColor)

			result.WriteString(style.Render(string(char)))
		}

		if lineIndex < len(lines)-1 {
			result.WriteString("\n")
		}
	}

	return result.String()
}
