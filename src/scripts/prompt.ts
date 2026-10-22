// Terminal prompts shared by the setup commands.

// Reads one line. With `hidden`, nothing typed is shown (a * is printed per character), which is what you want for
// a key. When input is piped in rather than typed, the first line is used.
export function readLine(prompt: string, hidden: boolean): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += chunk));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }

  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let typed = '';
    const finish = (fn: () => void) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') return finish(() => reject(new Error('Cancelled. Nothing was saved.')));
        if (ch === '\r' || ch === '\n') return finish(() => resolve(typed));
        if (ch === '\u007f' || ch === '\b') {
          if (typed.length > 0) {
            typed = typed.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        typed += ch;
        process.stdout.write(hidden ? '*' : ch);
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
