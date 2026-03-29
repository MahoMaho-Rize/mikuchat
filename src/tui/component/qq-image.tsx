// QQ Image — text placeholder mode (no Kitty graphics)
import { useTheme } from "@tui/context/theme";

export interface QQImageProps {
  url?: string;
  file?: string;
  summary?: string;
  maxCols?: number;
  maxRows?: number;
}

export function QQImage(props: QQImageProps) {
  const { theme } = useTheme();
  const label = () => props.summary || props.file || "image";

  return (
    <box flexShrink={0}>
      <text>
        <span style={{ bg: theme.accent, fg: theme.background, bold: true }}>
          {" "}
          🖼 img{" "}
        </span>
        <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}>
          {" "}
          {label()}{" "}
        </span>
      </text>
    </box>
  );
}
