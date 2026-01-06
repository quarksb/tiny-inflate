# @kuake/tiny-inflate

This project is a modernized, TypeScript-first fork of the excellent [tiny-inflate](https://github.com/devongovett/tiny-inflate) library originally created by **Devon Govett**.

## Background

The core logic is based on Joergen Ibsen's [tiny inflate](https://bitbucket.org/jibsen/tinf) C library, which was ported to JavaScript by Devon Govett. 

As the original JavaScript repository is no longer actively maintained, this fork was created to provide:
- **TypeScript Support**: Full type definitions for better DX.
- **ES Modules**: Modern ESM-first exports for build tools like Vite, Bun, and Webpack 5.
- **Modern Tooling**: Powered by [Bun](https://bun.sh) for ultra-fast testing and building.

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

## Credits

This library originates from the dedicated work of:
- **[Joergen Ibsen](https://github.com/jibsen)**: Author of the original [tinf](https://bitbucket.org/jibsen/tinf) C library.
- **[Devon Govett](https://github.com/devongovett)**: Author of the original [tiny-inflate](https://github.com/devongovett/tiny-inflate) JavaScript port.

We thank them for their contributions to the open-source community.

## License

MIT
