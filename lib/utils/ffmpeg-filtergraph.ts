// Same as WHITESPACES in ffmpeg's av_get_token
const FILTERGRAPH_WHITESPACE = ' \n\t\r';
const FILTERGRAPH_LABEL_PATTERN = /^[\w.:-]+$/;
const INVALID_LABEL_MESSAGE = 'labels must be in brackets and only contain letters, digits, _ . : -';

/**
 * Checks a user-supplied ffmpeg filtergraph against a filter allowlist.
 *
 * Filter names and options are read the way ffmpeg reads them, after removing single quotes,
 * so a quoted value like `scale='min(iw,1280)':-2` can contain `,` or `;`.
 */
export class FfmpegFiltergraphValidator {
  private pos = 0;

  constructor(private readonly graph: string) {}

  /**
   * Explains why the filtergraph is not allowed, or returns null if it only uses `allowedFilters`.
   *
   * @param allowedFilters - Names of the filters the filtergraph may use
   */
  findUnsafePart(allowedFilters: ReadonlySet<string>): string | null {
    // With escapes, ffmpeg would unquote and unescape options a second time,
    // so the options it uses would differ from the ones checked here
    if (this.graph.includes('\\')) {
      return 'backslashes are not supported, use single quotes instead';
    }
    this.pos = 0;
    while (true) {
      if (!this.skipLabels()) {
        return INVALID_LABEL_MESSAGE;
      }
      const name = this.readToken('=,;[]');
      let options: string | null = '';
      if (name !== null && this.graph[this.pos] === '=') {
        this.pos++;
        options = this.readToken('[],;');
      }
      if (name === null || options === null) {
        return 'quotes must be closed';
      }
      // `scale@main` is an instance of the `scale` filter
      if (!allowedFilters.has(name.split('@')[0])) {
        return `the '${name}' filter is not supported`;
      }
      // ffmpeg loads the value of an option whose name starts with '/' from that file
      if (options.split(':').some((option) => option.trimStart().startsWith('/'))) {
        return `filter options starting with '/' are not supported`;
      }
      if (!this.skipLabels()) {
        return INVALID_LABEL_MESSAGE;
      }
      if (this.pos >= this.graph.length) {
        return null;
      }
      if (this.graph[this.pos] !== ',' && this.graph[this.pos] !== ';') {
        return `unexpected '${this.graph[this.pos]}'`;
      }
      this.pos++;
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.graph.length && FILTERGRAPH_WHITESPACE.includes(this.graph[this.pos])) {
      this.pos++;
    }
  }

  /**
   * Mirrors ffmpeg's av_get_token without escapes: reads up to an unquoted terminator,
   * removing quotes and the whitespace around the token. Returns null for an unclosed quote.
   */
  private readToken(terminators: string): string | null {
    this.skipWhitespace();
    let token = '';
    let quotedLength = 0;
    while (this.pos < this.graph.length && !terminators.includes(this.graph[this.pos])) {
      if (this.graph[this.pos] === "'") {
        const closingPos = this.graph.indexOf("'", this.pos + 1);
        if (closingPos < 0) {
          return null;
        }
        token += this.graph.slice(this.pos + 1, closingPos);
        quotedLength = token.length;
        this.pos = closingPos + 1;
      } else {
        token += this.graph[this.pos++];
      }
    }
    let end = token.length;
    while (end > quotedLength && FILTERGRAPH_WHITESPACE.includes(token[end - 1])) {
      end--;
    }
    return token.slice(0, end);
  }

  /**
   * Skips `[label]`s, returning false if a label is unclosed or has unsupported characters.
   */
  private skipLabels(): boolean {
    this.skipWhitespace();
    while (this.graph[this.pos] === '[') {
      const closingPos = this.graph.indexOf(']', this.pos);
      if (closingPos < 0 || !FILTERGRAPH_LABEL_PATTERN.test(this.graph.slice(this.pos + 1, closingPos))) {
        return false;
      }
      this.pos = closingPos + 1;
      this.skipWhitespace();
    }
    return true;
  }
}
