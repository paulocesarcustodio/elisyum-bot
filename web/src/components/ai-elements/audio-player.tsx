"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Experimental_SpeechResult as SpeechResult } from "ai";
import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import React from "react";
import type { ComponentProps, CSSProperties } from "react";

export type AudioPlayerProps = Omit<
  ComponentProps<typeof MediaController>,
  "audio"
>;

export const AudioPlayer = ({
  children,
  style,
  className,
  ...props
}: AudioPlayerProps) => (
  <MediaController
    audio
    data-slot="audio-player"
    className={cn("w-full", className)}
    style={
      {
        display: "block",
        width: "100%",
        "--media-background-color": "transparent",
        "--media-button-icon-height": "1rem",
        "--media-button-icon-width": "1rem",
        "--media-control-background": "transparent",
        "--media-control-hover-background": "var(--color-accent)",
        "--media-control-padding": "0",
        "--media-font": "var(--font-sans)",
        "--media-font-size": "10px",
        "--media-icon-color": "currentColor",
        "--media-preview-time-background": "var(--color-background)",
        "--media-preview-time-border-radius": "var(--radius-md)",
        "--media-preview-time-text-shadow": "none",
        "--media-primary-color": "var(--color-primary)",
        "--media-range-bar-color": "var(--color-primary)",
        "--media-range-track-background": "var(--color-secondary)",
        "--media-time-range-buffered-color": "transparent",
        "--media-secondary-color": "var(--color-secondary)",
        "--media-text-color": "var(--color-foreground)",
        "--media-tooltip-arrow-display": "none",
        "--media-tooltip-background": "var(--color-background)",
        "--media-tooltip-border-radius": "var(--radius-md)",
        ...style,
      } as CSSProperties
    }
    {...props}
  >
    {children}
  </MediaController>
);

export type AudioPlayerElementProps = Omit<ComponentProps<"audio">, "src"> &
  (
    | {
        data: SpeechResult["audio"];
      }
    | {
        src: string;
      }
  );

export const AudioPlayerElement = ({ ...props }: AudioPlayerElementProps) => (
  // oxlint-disable-next-line eslint-plugin-jsx-a11y(media-has-caption) -- audio player captions are provided by consumer
  <audio
    data-slot="audio-player-element"
    slot="media"
    src={
      "src" in props
        ? props.src
        : `data:${props.data.mediaType};base64,${props.data.base64}`
    }
    {...props}
  />
);

export type AudioPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

export const AudioPlayerControlBar = ({
  children,
  className,
  ...props
}: AudioPlayerControlBarProps) => (
  <MediaControlBar
    data-slot="audio-player-control-bar"
    style={{ display: "flex", width: "100%" }}
    className={cn("items-center gap-1 px-1", className)}
    {...props}
  >
    {children}
  </MediaControlBar>
);

export type AudioPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

export const AudioPlayerPlayButton = ({
  className,
  ...props
}: AudioPlayerPlayButtonProps) => (
  <Button asChild size="icon-sm" variant="outline" className="shrink-0">
    <MediaPlayButton
      className={cn("bg-transparent", className)}
      data-slot="audio-player-play-button"
      {...props}
    />
  </Button>
);

export type AudioPlayerSeekBackwardButtonProps = ComponentProps<
  typeof MediaSeekBackwardButton
>;

export const AudioPlayerSeekBackwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekBackwardButtonProps) => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekBackwardButton
      data-slot="audio-player-seek-backward-button"
      seekOffset={seekOffset}
      {...props}
    />
  </Button>
);

export type AudioPlayerSeekForwardButtonProps = ComponentProps<
  typeof MediaSeekForwardButton
>;

export const AudioPlayerSeekForwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekForwardButtonProps) => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekForwardButton
      data-slot="audio-player-seek-forward-button"
      seekOffset={seekOffset}
      {...props}
    />
  </Button>
);

export type AudioPlayerTimeDisplayProps = ComponentProps<
  typeof MediaTimeDisplay
>;

export const AudioPlayerTimeDisplay = ({
  className,
  ...props
}: AudioPlayerTimeDisplayProps) => (
  <MediaTimeDisplay
    className={cn("tabular-nums text-xs shrink-0", className)}
    data-slot="audio-player-time-display"
    {...props}
  />
);

export const AudioPlayerTimeRange = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) =>
  React.createElement('media-time-range', {
    className: cn(className),
    'data-slot': 'audio-player-time-range',
    ...props,
  });

export type AudioPlayerDurationDisplayProps = ComponentProps<
  typeof MediaDurationDisplay
>;

export const AudioPlayerDurationDisplay = ({
  className,
  ...props
}: AudioPlayerDurationDisplayProps) => (
  <MediaDurationDisplay
    className={cn("tabular-nums text-xs shrink-0", className)}
    data-slot="audio-player-duration-display"
    {...props}
  />
);

export type AudioPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

export const AudioPlayerMuteButton = ({
  className,
  ...props
}: AudioPlayerMuteButtonProps) => (
  <MediaMuteButton
    className={cn("", className)}
    data-slot="audio-player-mute-button"
    {...props}
  />
);

export type AudioPlayerVolumeRangeProps = ComponentProps<
  typeof MediaVolumeRange
>;

export const AudioPlayerVolumeRange = ({
  className,
  ...props
}: AudioPlayerVolumeRangeProps) => (
  <MediaVolumeRange
    className={cn("", className)}
    data-slot="audio-player-volume-range"
    {...props}
  />
);
