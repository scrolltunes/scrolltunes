#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import OrderedDict
from fractions import Fraction
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


def parse_tempo_from_direction(direction: ET.Element) -> float | None:
    sound = direction.find("sound")
    if sound is not None:
        tempo_attr = sound.attrib.get("tempo")
        if tempo_attr is not None:
            try:
                return float(tempo_attr)
            except ValueError:
                return None
    per_minute = direction.find(".//per-minute")
    if per_minute is not None and per_minute.text:
        try:
            return float(per_minute.text.strip())
        except ValueError:
            return None
    return None


def collect_events(
    part: ET.Element,
) -> tuple[list[tuple[Fraction, str, int]], list[tuple[Fraction, float]]]:
    divisions = 1
    global_pos = Fraction(0, 1)
    lyric_events: list[tuple[Fraction, str, int]] = []
    tempo_events: list[tuple[Fraction, float]] = []

    for measure in part.findall("measure"):
        current_pos = Fraction(0, 1)
        max_pos = Fraction(0, 1)
        for child in list(measure):
            tag = child.tag
            if tag == "attributes":
                divisions_node = child.find("divisions")
                if divisions_node is not None and divisions_node.text:
                    divisions = int(divisions_node.text.strip())
            elif tag == "direction":
                tempo = parse_tempo_from_direction(child)
                if tempo is not None:
                    offset = Fraction(0, 1)
                    offset_node = child.find("offset")
                    if offset_node is not None and offset_node.text:
                        try:
                            offset = Fraction(
                                int(offset_node.text.strip()), divisions
                            )
                        except ValueError:
                            offset = Fraction(0, 1)
                    tempo_events.append((global_pos + current_pos + offset, tempo))
            elif tag == "sound":
                tempo_attr = child.attrib.get("tempo")
                if tempo_attr is not None:
                    try:
                        tempo = float(tempo_attr)
                        tempo_events.append((global_pos + current_pos, tempo))
                    except ValueError:
                        pass
            elif tag == "note":
                duration_node = child.find("duration")
                if duration_node is None or not duration_node.text:
                    continue
                try:
                    duration = Fraction(int(duration_node.text.strip()), divisions)
                except ValueError:
                    continue
                is_chord = child.find("chord") is not None
                for lyric in child.findall("lyric"):
                    text = lyric.findtext("text")
                    if text:
                        lyric_events.append(
                            (global_pos + current_pos, text.strip(), len(lyric_events))
                        )
                if not is_chord:
                    current_pos += duration
                    if current_pos > max_pos:
                        max_pos = current_pos
            elif tag in {"backup", "forward"}:
                duration_node = child.find("duration")
                if duration_node is None or not duration_node.text:
                    continue
                try:
                    duration = Fraction(int(duration_node.text.strip()), divisions)
                except ValueError:
                    continue
                if tag == "backup":
                    current_pos -= duration
                else:
                    current_pos += duration
                    if current_pos > max_pos:
                        max_pos = current_pos
        if max_pos > 0:
            global_pos += max_pos

    if not lyric_events:
        raise ValueError("No lyrics found in target part")

    return lyric_events, tempo_events




def extract_lyrics(
    input_path: Path,
    part_id: str,
    dedupe: bool,
) -> tuple[
    list[str],
    int,
    list[tuple[Fraction, str, int]],
    list[tuple[Fraction, float]],
]:
    root = ET.parse(input_path).getroot()
    part = root.find(f"part[@id='{part_id}']")
    if part is None:
        raise ValueError(f"Part {part_id} not found")

    lyric_events, tempo_events = collect_events(part)

    tempo_events.sort(key=lambda x: x[0])
    if tempo_events:
        first_pos, first_tempo = tempo_events[0]
        if first_pos > 0:
            tempo_events.insert(0, (Fraction(0, 1), first_tempo))
    else:
        tempo_events = [(Fraction(0, 1), 120.0)]

    lyric_events.sort(key=lambda x: (x[0], x[2]))
    raw_count = len(lyric_events)
    if dedupe:
        deduped_events: list[tuple[Fraction, str, int]] = []
        last_key: tuple[Fraction, str] | None = None
        for pos, text, index in lyric_events:
            key = (pos, text)
            if last_key == key:
                continue
            deduped_events.append((pos, text, index))
            last_key = key
        lyric_events = deduped_events

    current_pos = Fraction(0, 1)
    current_time = 0.0
    current_tempo = tempo_events[0][1]
    tempo_idx = 0

    lines: list[str] = []

    for pos, text, _ in lyric_events:
        while tempo_idx + 1 < len(tempo_events) and tempo_events[tempo_idx + 1][0] <= pos:
            next_pos, next_tempo = tempo_events[tempo_idx + 1]
            delta = next_pos - current_pos
            current_time += float(delta) * 60.0 / current_tempo
            current_pos = next_pos
            tempo_idx += 1
            current_tempo = next_tempo
        delta = pos - current_pos
        if delta:
            current_time += float(delta) * 60.0 / current_tempo
            current_pos = pos

        total_centis = int(round(current_time * 100.0))
        minutes = total_centis // 6000
        seconds = (total_centis // 100) % 60
        centis = total_centis % 100
        line = f"[{minutes:02d}:{seconds:02d}.{centis:02d}] {text}"
        lines.append(line)

    return lines, raw_count, lyric_events, tempo_events


def build_word_timings(
    lyric_events: list[tuple[Fraction, str, int]],
) -> list[tuple[Fraction, str]]:
    words: list[tuple[Fraction, str]] = []
    buffer_text = ""
    buffer_time: Fraction | None = None

    for pos, text, _ in lyric_events:
        if buffer_time is None:
            buffer_time = pos
        cleaned = text.strip()
        if cleaned.endswith("-"):
            buffer_text += cleaned[:-1]
            continue
        buffer_text += cleaned
        words.append((buffer_time, buffer_text))
        buffer_text = ""
        buffer_time = None

    if buffer_time is not None and buffer_text:
        words.append((buffer_time, buffer_text))

    return words


def read_lrc_lines(path: Path) -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip("\n")
        if not line:
            lines.append(("", ""))
            continue
        if not line.startswith("[") or "]" not in line:
            lines.append(("", line))
            continue
        tag_end = line.find("]")
        lines.append((line[: tag_end + 1], line[tag_end + 1 :].lstrip()))
    return lines


def format_timecode(seconds: float) -> str:
    total_centis = int(round(seconds * 100.0))
    minutes = total_centis // 6000
    secs = (total_centis // 100) % 60
    centis = total_centis % 100
    return f"{minutes:02d}:{secs:02d}.{centis:02d}"


def normalize_token(token: str) -> str:
    cleaned = re.sub(r"^[\"'“”‘’\\(\\)\\[\\]{}<>]+", "", token)
    cleaned = re.sub(r"[\"'“”‘’\\(\\)\\[\\]{}<>:;,\\.\\?!]+$", "", cleaned)
    cleaned = cleaned.strip()
    return cleaned.lower()


def build_lrc_token_map(
    lrc_lines: list[tuple[str, str]],
) -> list[tuple[int, int, str, str]]:
    tokens: list[tuple[int, int, str, str]] = []
    for line_index, (_, text) in enumerate(lrc_lines):
        if not text:
            continue
        for token_index, token in enumerate(text.split(" ")):
            if token == "":
                continue
            normalized = normalize_token(token)
            if not normalized:
                continue
            tokens.append((line_index, token_index, token, normalized))
    return tokens


def parse_time_tag(tag: str) -> float | None:
    match = re.match(r"^\[(\d{2}):(\d{2})\.(\d{2})\]$", tag)
    if not match:
        return None
    minutes = int(match.group(1))
    seconds = int(match.group(2))
    centis = int(match.group(3))
    return minutes * 60 + seconds + centis / 100.0


def last_lrc_time(lrc_lines: list[tuple[str, str]]) -> float | None:
    last_time: float | None = None
    for tag, _ in lrc_lines:
        if not tag:
            continue
        parsed = parse_time_tag(tag)
        if parsed is not None:
            last_time = parsed
    return last_time


def extract_metadata(root: ET.Element) -> list[str]:
    tags: "OrderedDict[str, str]" = OrderedDict()

    work_title = root.findtext("work/work-title")
    movement_title = root.findtext("movement-title")
    if work_title:
        tags["ti"] = work_title.strip()
    elif movement_title:
        tags["ti"] = movement_title.strip()

    creator_nodes = root.findall("identification/creator")
    if creator_nodes:
        creators = [node.text.strip() for node in creator_nodes if node.text]
        if creators:
            tags["ar"] = ", ".join(creators)
    composer = None
    for node in creator_nodes:
        if node.attrib.get("type") == "composer" and node.text:
            composer = node.text.strip()
            break
    if composer:
        tags["ar"] = composer

    encoding_software = root.findtext("identification/encoding/software")
    if encoding_software:
        tags["by"] = encoding_software.strip()

    source = root.findtext("identification/source")
    if source:
        tags["al"] = source.strip()

    return [f"[{key}:{value}]" for key, value in tags.items() if value]


def merge_enhanced_lrc(
    lrc_lines: list[tuple[str, str]],
    word_timings: list[tuple[Fraction, str]],
    tempo_events: list[tuple[Fraction, float]],
    force: bool,
    length_tolerance: float,
    metadata_tags: list[str],
) -> list[str]:
    # Convert word positions to absolute times once for efficient consumption.
    tempo_events.sort(key=lambda x: x[0])
    if tempo_events:
        first_pos, first_tempo = tempo_events[0]
        if first_pos > 0:
            tempo_events.insert(0, (Fraction(0, 1), first_tempo))
    else:
        tempo_events = [(Fraction(0, 1), 120.0)]

    def positions_to_times(
        positions: list[tuple[Fraction, str]],
    ) -> list[tuple[float, str]]:
        output_times: list[tuple[float, str]] = []
        current_pos = Fraction(0, 1)
        current_time = 0.0
        current_tempo = tempo_events[0][1]
        tempo_idx = 0
        for pos, text in positions:
            while tempo_idx + 1 < len(tempo_events) and tempo_events[tempo_idx + 1][0] <= pos:
                next_pos, next_tempo = tempo_events[tempo_idx + 1]
                delta = next_pos - current_pos
                current_time += float(delta) * 60.0 / current_tempo
                current_pos = next_pos
                tempo_idx += 1
                current_tempo = next_tempo
            delta = pos - current_pos
            if delta:
                current_time += float(delta) * 60.0 / current_tempo
                current_pos = pos
            output_times.append((current_time, text))
        return output_times

    word_times = [(format_timecode(t), w) for t, w in positions_to_times(word_timings)]
    lrc_length = last_lrc_time(lrc_lines)
    if lrc_length is not None and word_times:
        last_word_time = word_times[-1][0]
        last_word_seconds = parse_time_tag(f"[{last_word_time}]")
        if last_word_seconds is not None:
            delta = last_word_seconds - lrc_length
            if delta > length_tolerance and not force:
                raise ValueError(
                    "Song length mismatch between MusicXML and LRC. "
                    f"LRC end: {lrc_length:.2f}s, MusicXML end: {last_word_seconds:.2f}s. "
                    "Use --force to override or --length-tolerance to adjust."
                )

    word_index = 0
    output: list[str] = []
    existing_tags = {
        tag for tag, text in lrc_lines if tag and not text and parse_time_tag(tag) is None
    }
    if metadata_tags:
        for tag in metadata_tags:
            if tag not in existing_tags:
                output.append(tag)

    timed_lines = [(parse_time_tag(tag), tag, text) for tag, text in lrc_lines]
    next_times = []
    future_time = None
    for time_value, _, _ in reversed(timed_lines):
        next_times.append(future_time)
        if time_value is not None:
            future_time = time_value
    next_times.reverse()

    for (time_value, time_tag, text), next_time in zip(timed_lines, next_times):
        if not text:
            output.append(time_tag)
            continue
        tokens = text.split(" ")
        enhanced_tokens: list[str] = []
        for token_index, token in enumerate(tokens):
            if token == "":
                continue
            if not normalize_token(token):
                enhanced_tokens.append(token)
                continue
            if word_index >= len(word_times):
                enhanced_tokens.append(token)
                continue
            word_time, word_text = word_times[word_index]
            word_index += 1
            # Preserve the original token text from the LRC line.
            enhanced_tokens.append(f"<{word_time}>{token}")
        enhanced_text = " ".join(enhanced_tokens)
        output.append(f"{time_tag} {enhanced_text}".rstrip())

    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract MusicXML lyrics into LRC-style timecodes."
    )
    parser.add_argument("input", type=Path, help="Input MusicXML file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output LRC file (default: input basename .lrc)",
    )
    parser.add_argument(
        "--part",
        default="P1",
        help="MusicXML part id to read lyrics from (default: P1)",
    )
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="Keep duplicate lyric entries at identical timestamps",
    )
    parser.add_argument(
        "--lrc",
        type=Path,
        help="Base LRC file to enrich with word-level timing tags",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow enhanced LRC output even when word counts differ",
    )
    parser.add_argument(
        "--length-tolerance",
        type=float,
        default=5.0,
        help="Allowed difference (seconds) between LRC end and MusicXML end",
    )
    args = parser.parse_args()

    output_path = args.output
    if output_path is None:
        output_path = args.input.with_suffix(".lrc")

    try:
        root = ET.parse(args.input).getroot()
    except ET.ParseError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    part = root.find(f"part[@id='{args.part}']")
    if part is None:
        print(f"Error: Part {args.part} not found", file=sys.stderr)
        return 1

    try:
        lines, raw_count, lyric_events, tempo_events = extract_lyrics(
            args.input, args.part, dedupe=not args.no_dedupe
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.lrc:
        lyric_events.sort(key=lambda x: (x[0], x[2]))
        word_timings = build_word_timings(lyric_events)
        lrc_lines = read_lrc_lines(args.lrc)
        metadata_tags = extract_metadata(root)
        try:
            enhanced_lines = merge_enhanced_lrc(
                lrc_lines,
                word_timings,
                tempo_events,
                args.force,
                args.length_tolerance,
                metadata_tags,
            )
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        output_path.write_text("\n".join(enhanced_lines) + "\n", encoding="utf-8")
        print(
            f"Wrote {len(enhanced_lines)} enhanced lines to {output_path} "
            f"(from {len(word_timings)} word timings)"
        )
    else:
        output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote {len(lines)} lines (from {raw_count} lyric events) to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
