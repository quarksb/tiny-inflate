# @kuake/tiny-inflate

> This is a modernized fork of the original [tiny-inflate](https://github.com/devongovett/tiny-inflate) by Devon Govett.

This is a port of Joergen Ibsen's [tiny inflate](https://bitbucket.org/jibsen/tinf) to TypeScript/ESM.
Minified it is about 3KB. While being very small, it is also reasonably fast (about 30% - 50% slower than [pako](https://github.com/nodeca/pako) on average), and should be good enough for many applications.

## Features

- **Tiny**: ~3KB minified.
- **Modern**: Written in TypeScript with ESM support.
- **Fast**: Optimized for Bun and modern JS engines.
- **Zero Dependencies**: Core logic has no external dependencies.
- **Maintenance**: This fork is maintained for modern development environments.

## Installation

```bash
bun add @kuake/tiny-inflate
# or
npm install @kuake/tiny-inflate
```

## Example

To use tiny-inflate, you need two things: a buffer of data compressed with deflate, and the decompressed size (often stored in a file header) to allocate your output buffer. Input and output buffers can be `Uint8Array` or Node.js `Buffer`.

```typescript
import inflate from '@kuake/tiny-inflate';

const compressed = new Uint8Array([ ... ]);
const decompressedSize = 1024;
const output = new Uint8Array(decompressedSize);

const result = inflate(compressed, output);
// result is a subarray of output with the actual decompressed length
```

## Development

This project uses [Bun](https://bun.sh) for development, testing, and building.

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build for production
bun run build
```

## License

MIT
