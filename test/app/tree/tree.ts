import { Hasher, Node } from './hasher';

type Level = { [node: number]: Node };
export type Data = string;
export type Success = number;

export type Witness = {
  path: Array<boolean>;
  nodes: Array<Node>;
  leaf: Node;
  index: number;
  data?: Data;
  depth?: number;
};

export class Tree {
  public readonly zeros: Array<Node>;
  public readonly depth: number;
  public readonly setSize: number;
  public readonly hasher: Hasher;
  private readonly tree: Array<Level> = [];

  public static new(depth: number, hasher?: Hasher): Tree {
    return new Tree(depth, hasher || Hasher.new());
  }

  constructor(depth: number, hasher: Hasher) {
    this.depth = depth;
    this.setSize = 2 ** this.depth;
    this.tree = [];
    for (let i = 0; i < depth + 1; i++) {
      this.tree.push({});
    }
    this.hasher = hasher;
    this.zeros = this.hasher.zeros(depth);
  }

  get root(): Node {
    return this.tree[0][0] || this.zeros[0];
  }

  public getNode(level: number, index: number): Node {
    return this.tree[level][index] || this.zeros[level];
  }

  // witnessForBatch given merging subtree offset and depth constructs a witness
  public witnessForBatch(mergeOffsetLower: number, subtreeDepth: number): Witness {
    const mergeSize = 1 << subtreeDepth;
    const mergeOffsetUpper = mergeOffsetLower + mergeSize;
    const pathFollower = mergeOffsetLower >> subtreeDepth;
    if (mergeOffsetLower >> subtreeDepth != (mergeOffsetUpper - 1) >> subtreeDepth) {
      throw new Error('bad merge alignment');
    }
    return this.witness(pathFollower, this.depth - subtreeDepth);
  }

  // witness given index and depth constructs a witness
  public witness(index: number, depth: number = this.depth): Witness {
    const path = Array<boolean>(depth);
    const nodes = Array<Node>(depth);
    let nodeIndex = index;
    const leaf = this.getNode(depth, nodeIndex);
    for (let i = 0; i < depth; i++) {
      nodeIndex ^= 1;
      nodes[i] = this.getNode(depth - i, nodeIndex);
      path[i] = (nodeIndex & 1) == 1;
      nodeIndex >>= 1;
    }
    return { path, nodes, leaf, index, depth };
  }

  // checkInclusion verifies the given witness.
  // It performs root calculation rather than just looking up for the leaf or node
  public checkInclusion(witness: Witness): Success {
    // we check the form of witness data rather than looking up for the leaf
    if (witness.nodes.length == 0) return -2;
    if (witness.nodes.length != witness.path.length) return -3;
    const data = witness.data;
    if (data) {
      if (witness.nodes.length != this.depth) return -4;
      if (this.hasher.hash(data) != witness.leaf) return -5;
    }
    let depth = witness.depth;
    if (!depth) {
      depth = this.depth;
    }
    let acc = witness.leaf;
    for (let i = 0; i < depth; i++) {
      const node = witness.nodes[i];
      if (witness.path[i]) {
        acc = this.hasher.hash2(acc, node);
      } else {
        acc = this.hasher.hash2(node, acc);
      }
    }
    return acc == this.root ? 0 : -1;
  }

  // insertSingle updates tree with a single raw data at given index
  public insertSingle(leafIndex: number, data: Data): Success {
    if (leafIndex >= this.setSize) {
      return -1;
    }
    this.tree[this.depth][leafIndex] = this.hasher.toLeaf(data);
    this.ascend(leafIndex, 1);
    return 0;
  }

  // updateSingle updates tree with a leaf at given index
  public updateSingle(leafIndex: number, leaf: Node): Success {
    if (leafIndex >= this.setSize) {
      return -1;
    }
    this.tree[this.depth][leafIndex] = leaf;
    this.ascend(leafIndex, 1);
    return 0;
  }

  // insertBatch given multiple raw data updates tree ascending from an offset
  public insertBatch(offset: number, data: Array<Data>): Success {
    const len = data.length;
    if (len == 0) return -1;
    if (len + offset > this.setSize) return -2;
    for (let i = 0; i < len; i++) {
      this.tree[this.depth][offset + i] = this.hasher.toLeaf(data[i]);
    }
    this.ascend(offset, len);
    return 0;
  }

  // updateBatch given multiple sequencial data updates tree ascending from an offset
  public updateBatch(offset: number, data: Array<Node>): Success {
    const len = data.length;
    if (len == 0) return -1;
    if (len + offset > this.setSize) return -2;
    for (let i = 0; i < len; i++) {
      this.tree[this.depth][offset + i] = data[i];
    }
    this.ascend(offset, len);
    return 0;
  }

  public isZero(level: number, leafIndex: number): boolean {
    return this.zeros[level] == this.getNode(level, leafIndex);
  }

  private ascend(offset: number, len: number) {
    for (let level = this.depth; level > 0; level--) {
      if (offset & 1) {
        offset -= 1;
        len += 1;
      }
      if (len & 1) {
        len += 1;
      }
      for (let node = offset; node < offset + len; node += 2) {
        this.updateCouple(level, node);
      }
      offset >>= 1;
      len >>= 1;
    }
  }

  private updateCouple(level: number, leafIndex: number) {
    const n = this.hashCouple(level, leafIndex);
    this.tree[level - 1][leafIndex >> 1] = n;
  }

  private hashCouple(level: number, leafIndex: number) {
    const X = this.getCouple(level, leafIndex);
    return this.hasher.hash2(X.l, X.r);
  }

  private getCouple(level: number, index: number): { l: Node; r: Node } {
    index = index & ~1;
    return {
      l: this.getNode(level, index),
      r: this.getNode(level, index + 1),
    };
  }
}
