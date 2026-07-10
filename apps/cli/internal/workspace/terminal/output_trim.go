package terminal

const (
	asciiEscapeCode byte = 0x1b
	asciiBellCode   byte = 0x07
)

type escapeParseMode uint8

const (
	escapeParseModeNone escapeParseMode = iota
	escapeParseModeCSI
	escapeParseModeOSC
)

func trimTerminalOutputToMaxBytes(data string, maxBytes int) string {
	if len(data) <= maxBytes {
		return data
	}

	startIndex := alignTerminalTrimStartToEscapeBoundary(data, len(data)-maxBytes)
	return data[startIndex:]
}

func alignTerminalTrimStartToEscapeBoundary(data string, startIndex int) int {
	if startIndex <= 0 || startIndex >= len(data) {
		return startIndex
	}

	mode := escapeParseModeNone

	for index := 0; index < startIndex; index += 1 {
		current := data[index]

		switch mode {
		case escapeParseModeNone:
			if current != asciiEscapeCode {
				continue
			}

			if index+1 >= len(data) {
				return len(data)
			}

			next := data[index+1]
			switch next {
			case '[':
				mode = escapeParseModeCSI
				index += 1
			case ']':
				mode = escapeParseModeOSC
				index += 1
			default:
				index += 1
			}
		case escapeParseModeCSI:
			if current >= 0x40 && current <= 0x7e {
				mode = escapeParseModeNone
			}
		case escapeParseModeOSC:
			if current == asciiBellCode {
				mode = escapeParseModeNone
				continue
			}

			if current == asciiEscapeCode && index+1 < len(data) && data[index+1] == '\\' {
				mode = escapeParseModeNone
				index += 1
			}
		}
	}

	if mode == escapeParseModeNone {
		return startIndex
	}

	for index := startIndex; index < len(data); index += 1 {
		current := data[index]

		switch mode {
		case escapeParseModeCSI:
			if current >= 0x40 && current <= 0x7e {
				return index + 1
			}
		case escapeParseModeOSC:
			if current == asciiBellCode {
				return index + 1
			}

			if current == asciiEscapeCode && index+1 < len(data) && data[index+1] == '\\' {
				return index + 2
			}
		default:
			return startIndex
		}
	}

	return len(data)
}
