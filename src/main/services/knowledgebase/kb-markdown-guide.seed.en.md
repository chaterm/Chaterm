# Markdown Syntax Guide

The Chaterm Knowledge Base built-in editor is based on Monaco (same core as VSCode) and natively supports Markdown syntax highlighting and preview rendering. This document lists the main Markdown syntax and usage.

## Headings

Use `#` to indicate headings, from levels 1 to 6 in descending order:

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

## Text Styles

| Syntax              | Result            | Example                 |
| ------------------- | ----------------- | ----------------------- |
| `**bold**`          | **bold**          | `**important content**` |
| `*italic*`          | _italic_          | `*emphasis content*`    |
| `***bold italic***` | **_bold italic_** | `***very important***`  |
| `~~strikethrough~~` | ~~strikethrough~~ | `~~deprecated~~`        |
| `` `inline code` `` | `inline code`     | `` `npm install` ``     |

## Lists

### Unordered Lists

Use `-`, `*`, or `+` as list markers:

- First item
- Second item
  - Nested item A
  - Nested item B
- Third item

### Ordered Lists

Use numbers followed by `.` as list markers:

1. Step one
2. Step two
3. Step three

### Task Lists

- [x] Completed task
- [ ] Incomplete task
- [ ] To-do item

## Links and Images

### Links

[Link text](https://example.com)

### Images

Supports web images and local images within the Knowledge Base:
![Image description](https://chaterm.cn/images/hero-dark.webp)

![Local image](images/interface.png)

Local image paths are resolved relative to the current file's directory.

## Code

### Inline Code

Wrap with backticks:

Run `ls -la` to list files

### Code Blocks

Wrap with triple backticks and optionally specify a language for syntax highlighting:

```python
def hello():
    print("Hello, World!")
```

Supported languages include: `python`, `javascript`, `typescript`, `go`, `java`, `cpp`, `csharp`, `ruby`, `php`, `rust`, `sql`, `shell`, `json`, `yaml`, `markdown`, `html`, `css`, and more.

## Blockquotes

Use `>` for blockquotes:

> This is a blockquote.
> It can span multiple lines.
>
> It can also include blank lines.

Nested blockquotes:

> Outer quote
>
> > Inner quote

## Tables

Build tables with `|` and `-`:

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

Alignment:

| Left | Center | Right |
| :--- | :----: | ----: |
| left | center | right |

## Horizontal Rules

Use three or more `-`, `*`, or `_`:

---

---

---

## HTML

You can use HTML tags directly in Markdown (sanitized for security):

<details>
<summary>Click to expand</summary>

Here is the collapsed content.

</details>

<kbd>Ctrl</kbd> + <kbd>C</kbd>

## Escape Characters

Prefix special characters with `\` to escape Markdown formatting:

\*not italic\*
\# not a heading
\[not a link\](url)
