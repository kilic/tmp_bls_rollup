import * as mcl from './mcl';
import { Tx } from './tx';

const accountIDLen = 4;
const tokenIdLen = 2;
const balanceLen = 4;
const nonceLen = 4;

export const EMPTY_ACCOUNT = '0x8000000000000000000000000000000000000000000000000000000000000000';

export class Account {
  publicKey: mcl.PublicKey;
  secretKey: mcl.SecretKey;
  public static new(
    accountID: number,
    tokenId: number,
    balance: number,
    nonce: number,
    stateID: number = -1
  ): Account {
    return new Account(accountID, tokenId, balance, nonce, stateID);
  }

  public static decode(encoded: string): Account {
    if (encoded.slice(0, 2) == '0x') {
      assert.lengthOf(encoded, 66);
      encoded = encoded.slice(2);
    } else {
      assert.lengthOf(encoded, 64);
    }
    assert.isTrue(web3.utils.isHex(encoded));
    let t0 = 64 - nonceLen * 2;
    let t1 = 64;
    const nonce = web3.utils.hexToNumber('0x' + encoded.slice(t0, t1));
    t1 = t0;
    t0 = t0 - balanceLen * 2;
    const balance = web3.utils.hexToNumber('0x' + encoded.slice(t0, t1));
    t1 = t0;
    t0 = t0 - tokenIdLen * 2;
    const tokenId = web3.utils.hexToNumber('0x' + encoded.slice(t0, t1));
    t1 = t0;
    t0 = t0 - accountIDLen * 2;
    const accountID = web3.utils.hexToNumber('0x' + encoded.slice(t0, t1));
    return Account.new(accountID, tokenId, balance, nonce);
  }

  constructor(
    public accountID: number,
    public tokenId: number,
    public balance: number,
    public nonce: number,
    public stateID: number = -1
  ) {}

  public newKeyPair() {
    const keyPair = mcl.newKeyPair();
    this.publicKey = keyPair.pubkey;
    this.secretKey = keyPair.secret;
  }

  public sign(tx: Tx) {
    const msg = tx.encode(true);
    const { signature, M } = mcl.sign(msg, this.secretKey);
    return signature;
  }

  public setStateID(stateID: number) {
    this.stateID = stateID;
  }

  public encode(): string {
    let serialized = '0x';
    let accountID = web3.utils.padLeft(web3.utils.toHex(this.accountID), accountIDLen * 2);
    let tokenId = web3.utils.padLeft(web3.utils.toHex(this.tokenId), tokenIdLen * 2);
    let balance = web3.utils.padLeft(web3.utils.toHex(this.balance), balanceLen * 2);
    let nonce = web3.utils.padLeft(web3.utils.toHex(this.nonce), nonceLen * 2);
    serialized = web3.utils.padLeft(
      serialized + accountID.slice(2) + tokenId.slice(2) + balance.slice(2) + nonce.slice(2),
      64
    );
    return serialized;
  }

  public toStateLeaf(): string {
    return web3.utils.soliditySha3(
      { v: this.accountID, t: 'uint32' },
      { v: this.tokenId, t: 'uint16' },
      { v: this.balance, t: 'uint32' },
      { v: this.nonce, t: 'uint32' }
    );
  }

  public encodePubkey(): string[] {
    return mcl.g2ToHex(this.publicKey);
  }

  public toAccountLeaf(): string {
    const publicKey = mcl.g2ToHex(this.publicKey);
    return web3.utils.soliditySha3(
      { v: publicKey[0], t: 'uint256' },
      { v: publicKey[1], t: 'uint256' },
      { v: publicKey[2], t: 'uint256' },
      { v: publicKey[3], t: 'uint256' }
    );
  }
}

