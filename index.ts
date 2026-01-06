const TINF_OK = 0;
const TINF_DATA_ERROR = -3;

/**
 * Represents a Huffman tree for decoding.
 */
class Tree {
  /** Table of code length counts */
  table: Uint16Array = new Uint16Array(16);
  /** Code to symbol translation table */
  trans: Uint16Array = new Uint16Array(288);
}

/**
 * State object for the inflation process.
 */
class Data {
  /** Source compressed data */
  source: Uint8Array;
  /** Current index in the source data */
  sourceIndex: number = 0;
  /** Current bit tag buffer */
  tag: number = 0;
  /** Number of bits remaining in the tag */
  bitcount: number = 0;
  
  /** Destination buffer for decompressed data */
  dest: Uint8Array;
  /** Current length of decompressed data in the destination buffer */
  destLen: number = 0;
  
  /** Dynamic length/symbol Huffman tree */
  ltree: Tree = new Tree();
  /** Dynamic distance Huffman tree */
  dtree: Tree = new Tree();

  constructor(source: Uint8Array, dest: Uint8Array) {
    this.source = source;
    this.dest = dest;
  }
}

/* --------------------------------------------------- *
 * -- uninitialized global data (static structures) -- *
 * --------------------------------------------------- */

const sltree = new Tree();
const sdtree = new Tree();

/* extra bits and base tables for length codes */
const length_bits = new Uint8Array(30);
const length_base = new Uint16Array(30);

/* extra bits and base tables for distance codes */
const dist_bits = new Uint8Array(30);
const dist_base = new Uint16Array(30);

/* special ordering of code length codes */
const clcidx = new Uint8Array([
  16, 17, 18, 0, 8, 7, 9, 6,
  10, 5, 11, 4, 12, 3, 13, 2,
  14, 1, 15
]);

/* used by tinf_decode_trees, avoids allocations every call */
const code_tree = new Tree();
const lengths = new Uint8Array(288 + 32);

/* ----------------------- *
 * -- utility functions -- *
 * ----------------------- */

/* build extra bits and base tables */
/**
 * Builds extra bits and base tables for length and distance codes.
 * 
 * @param bits - Array to store extra bits.
 * @param base - Array to store base values.
 * @param delta - Increment value for bit calculation.
 * @param first - First base value.
 */
function tinf_build_bits_base(bits: Uint8Array, base: Uint16Array, delta: number, first: number) {
  let i: number, sum: number;

  /* build bits table */
  for (i = 0; i < delta; ++i) bits[i] = 0;
  for (i = 0; i < 30 - delta; ++i) bits[i + delta] = i / delta | 0;

  /* build base table */
  for (sum = first, i = 0; i < 30; ++i) {
    base[i] = sum;
    sum += 1 << bits[i];
  }
}

/* build the fixed huffman trees */
/**
 * Builds the fixed Huffman trees as specified in RFC 1951.
 * 
 * @param lt - The length tree to build.
 * @param dt - The distance tree to build.
 */
function tinf_build_fixed_trees(lt: Tree, dt: Tree) {
  let i: number;

  /* build fixed length tree */
  for (i = 0; i < 7; ++i) lt.table[i] = 0;

  lt.table[7] = 24;
  lt.table[8] = 152;
  lt.table[9] = 112;

  for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
  for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
  for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
  for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;

  /* build fixed distance tree */
  for (i = 0; i < 5; ++i) dt.table[i] = 0;

  dt.table[5] = 32;

  for (i = 0; i < 32; ++i) dt.trans[i] = i;
}

/* given an array of code lengths, build a tree */
const offs = new Uint16Array(16);

/**
 * Builds a Huffman tree from an array of code lengths.
 * 
 * @param t - The tree to build.
 * @param lengths - Array of code lengths.
 * @param off - Offset in the lengths array.
 * @param num - Number of symbols.
 */
function tinf_build_tree(t: Tree, lengths: Uint8Array, off: number, num: number) {
  let i: number, sum: number;

  /* clear code length count table */
  for (i = 0; i < 16; ++i) t.table[i] = 0;

  /* scan symbol lengths, and sum code length counts */
  for (i = 0; i < num; ++i) {
    const len = lengths[off + i];
    if (len !== undefined) t.table[len]++;
  }

  t.table[0] = 0;

  /* compute offset table for distribution sort */
  for (sum = 0, i = 0; i < 16; ++i) {
    offs[i] = sum;
    const count = t.table[i];
    if (count !== undefined) sum += count;
  }

  /* create code->symbol translation table (symbols sorted by code) */
  for (i = 0; i < num; ++i) {
    const len = lengths[off + i];
    if (len) {
        const offVal = offs[len];
        if (offVal !== undefined) {
            t.trans[offVal] = i;
            offs[len]++;
        }
    }
  }
}

/* ---------------------- *
 * -- decode functions -- *
 * ---------------------- */

/* get one bit from source stream */
/**
 * Reads a single bit from the bitstream.
 * 
 * @param d - The inflation state.
 * @returns The bit value (0 or 1).
 */
function tinf_getbit(d: Data) {
  /* check if tag is empty */
  if (!d.bitcount--) {
    /* load next tag */
    d.tag = d.source[d.sourceIndex++];
    d.bitcount = 7;
  }

  /* shift bit out of tag */
  const bit = d.tag & 1;
  d.tag >>>= 1;

  return bit;
}

/* read a num bit value from a stream and add base */
/**
 * Reads a specified number of bits from the bitstream and adds a base value.
 * 
 * @param d - The inflation state.
 * @param num - Number of bits to read.
 * @param base - Base value to add to the result.
 * @returns The resulting value.
 */
function tinf_read_bits(d: Data, num: number, base: number) {
  if (!num)
    return base;

  while (d.bitcount < 24) {
    d.tag |= (d.source[d.sourceIndex++]) << d.bitcount;
    d.bitcount += 8;
  }

  const val = d.tag & (0xffff >>> (16 - num));
  d.tag >>>= num;
  d.bitcount -= num;
  return val + base;
}

/* given a data stream and a tree, decode a symbol */
/**
 * Decodes a symbol from the bitstream using the provided Huffman tree.
 * 
 * @param d - The inflation state.
 * @param t - The Huffman tree to use for decoding.
 * @returns The decoded symbol.
 */
function tinf_decode_symbol(d: Data, t: Tree): number {
  while (d.bitcount < 24) {
    d.tag |= (d.source[d.sourceIndex++]) << d.bitcount;
    d.bitcount += 8;
  }
  
  let sum = 0, cur = 0, len = 0;
  let tag = d.tag;

  /* get more bits while code value is above sum */
  do {
    cur = 2 * cur + (tag & 1);
    tag >>>= 1;
    ++len;

    const count = t.table[len];
    if (count !== undefined) {
        sum += count;
        cur -= count;
    }
  } while (cur >= 0);
  
  d.tag = tag;
  d.bitcount -= len;

  return t.trans[sum + cur];
}

/* given a data stream, decode dynamic trees from it */
/**
 * Decodes dynamic Huffman trees from the bitstream.
 * 
 * @param d - The inflation state.
 * @param lt - The length tree to build.
 * @param dt - The distance tree to build.
 */
function tinf_decode_trees(d: Data, lt: Tree, dt: Tree) {
  let hlit, hdist, hclen;
  let i, num, length;

  /* get 5 bits HLIT (257-286) */
  hlit = tinf_read_bits(d, 5, 257);

  /* get 5 bits HDIST (1-32) */
  hdist = tinf_read_bits(d, 5, 1);

  /* get 4 bits HCLEN (4-19) */
  hclen = tinf_read_bits(d, 4, 4);

  for (i = 0; i < 19; ++i) lengths[i] = 0;

  /* read code lengths for code length alphabet */
  for (i = 0; i < hclen; ++i) {
    /* get 3 bits code length (0-7) */
    const clen = tinf_read_bits(d, 3, 0);
    const idx = clcidx[i];
    if (idx !== undefined) lengths[idx] = clen;
  }

  /* build code length tree */
  tinf_build_tree(code_tree, lengths, 0, 19);

  /* decode code lengths for the dynamic trees */
  for (num = 0; num < hlit + hdist;) {
    const symInRange = tinf_decode_symbol(d, code_tree);
    if (symInRange === undefined) break;
    const sym = symInRange;

    switch (sym) {
      case 16:
        /* copy previous code length 3-6 times (read 2 bits) */
        const prev = lengths[num - 1]!;
        for (length = tinf_read_bits(d, 2, 3); length; --length) {
          lengths[num++] = prev;
        }
        break;
      case 17:
        /* repeat code length 0 for 3-10 times (read 3 bits) */
        for (length = tinf_read_bits(d, 3, 3); length; --length) {
          lengths[num++] = 0;
        }
        break;
      case 18:
        /* repeat code length 0 for 11-138 times (read 7 bits) */
        for (length = tinf_read_bits(d, 7, 11); length; --length) {
          lengths[num++] = 0;
        }
        break;
      default:
        /* values 0-15 represent the actual code lengths */
        lengths[num++] = sym;
        break;
    }
  }

  /* build dynamic trees */
  tinf_build_tree(lt, lengths, 0, hlit);
  tinf_build_tree(dt, lengths, hlit, hdist);
}

/* ----------------------------- *
 * -- block inflate functions -- *
 * ----------------------------- */

/* given a stream and two trees, inflate a block of data */
/**
 * Inflates a block of compressed data using the provided trees.
 * 
 * @param d - The inflation state.
 * @param lt - The length Huffman tree.
 * @param dt - The distance Huffman tree.
 * @returns TINF_OK (0) on success.
 */
function tinf_inflate_block_data(d: Data, lt: Tree, dt: Tree) {
  while (1) {
    const sym = tinf_decode_symbol(d, lt);

    /* check for end of block */
    if (sym === 256) {
      return TINF_OK;
    }

    if (sym < 256) {
      d.dest[d.destLen++] = sym;
    } else {
      let length: number, dist: number, offsPtr: number;
      let i: number;

      const symAdj = sym - 257;

      /* possibly get more bits from length code */
      length = tinf_read_bits(d, length_bits[symAdj], length_base[symAdj]);

      dist = tinf_decode_symbol(d, dt);

      /* possibly get more bits from distance code */
      offsPtr = d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

      /* copy match */
      for (i = offsPtr; i < offsPtr + length; ++i) {
        d.dest[d.destLen++] = d.dest[i];
      }
    }
  }
}

/* inflate an uncompressed block of data */
/**
 * Inflates an uncompressed block of data.
 * 
 * @param d - The inflation state.
 * @returns TINF_OK (0) on success, or TINF_DATA_ERROR (-3) on error.
 */
function tinf_inflate_uncompressed_block(d: Data) {
  let length, invlength;
  let i;
  
  /* unread from bitbuffer */
  while (d.bitcount > 8) {
    d.sourceIndex--;
    d.bitcount -= 8;
  }

  /* get length */
  length = d.source[d.sourceIndex + 1];
  length = 256 * length + d.source[d.sourceIndex];

  /* get one's complement of length */
  invlength = d.source[d.sourceIndex + 3];
  invlength = 256 * invlength + d.source[d.sourceIndex + 2];

  /* check length */
  if (length !== (~invlength & 0x0000ffff))
    return TINF_DATA_ERROR;

  d.sourceIndex += 4;

  /* copy block */
  for (i = length; i; --i)
    d.dest[d.destLen++] = d.source[d.sourceIndex++];

  /* make sure we start next block on a byte boundary */
  d.bitcount = 0;

  return TINF_OK;
}

/**
 * Decompresses data using the DEFLATE algorithm.
 * 
 * @param source - The compressed source data as a Uint8Array.
 * @param dest - The destination buffer for decompressed data as a Uint8Array.
 * @returns A subarray of the destination buffer containing only the decompressed data.
 * @throws Error if a data error is encountered during decompression.
 */
export default function inflate(source: Uint8Array, dest: Uint8Array): Uint8Array {
  const d = new Data(source, dest);
  let bfinal, btype, res;

  do {
    /* read final block flag */
    bfinal = tinf_getbit(d);

    /* read block type (2 bits) */
    btype = tinf_read_bits(d, 2, 0);

    /* decompress block */
    switch (btype) {
      case 0:
        /* decompress uncompressed block */
        res = tinf_inflate_uncompressed_block(d);
        break;
      case 1:
        /* decompress block with fixed huffman trees */
        res = tinf_inflate_block_data(d, sltree, sdtree);
        break;
      case 2:
        /* decompress block with dynamic huffman trees */
        tinf_decode_trees(d, d.ltree, d.dtree);
        res = tinf_inflate_block_data(d, d.ltree, d.dtree);
        break;
      default:
        res = TINF_DATA_ERROR;
    }

    if (res !== TINF_OK)
      throw new Error('Data error');

  } while (!bfinal);

  if (d.destLen < d.dest.length) {
    return d.dest.subarray(0, d.destLen);
  }
  
  return d.dest;
}

/* -------------------- *
 * -- initialization -- *
 * -------------------- */

/* build fixed huffman trees */
tinf_build_fixed_trees(sltree, sdtree);

/* build extra bits and base tables */
tinf_build_bits_base(length_bits, length_base, 4, 3);
tinf_build_bits_base(dist_bits, dist_base, 2, 1);

/* fix a special case */
length_bits[28] = 0;
length_base[28] = 258;
