import { Tree } from './tree';
import { Account, EMPTY_ACCOUNT } from './state_account';
import { Tx0, Tx2, Tx1, Tx3 } from './tx';

interface ProofTx {
  senderAccount: string;
  receiverAccount: string;
  senderWitness: string[];
  receiverWitness: string[];
  safe: boolean;
}

interface ProofTxBatch {
  senderAccounts: string[];
  receiverAccounts: string[];
  senderWitnesses: string[][];
  receiverWitnesses: string[][];
  safe: boolean;
}

interface ProofDeposit {
  account: string;
  witness: string[];
  safe: boolean;
}

interface ProofDepositBatch {
  accounts: string[];
  witnesses: string[][];
  safe: boolean;
}

const STATE_WITNESS_LENGHT = 32;
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
const PLACEHOLDER_PROOF_ACC = EMPTY_ACCOUNT;
const PLACEHOLDER_PROOF_WITNESS = Array(STATE_WITNESS_LENGHT).fill(ZERO);
const PLACEHOLDER_PROOF = { account: PLACEHOLDER_PROOF_ACC, witness: PLACEHOLDER_PROOF_WITNESS, safe: false };

export class StateTree {
  public static new(stateDepth: number) {
    return new StateTree(stateDepth);
  }
  private stateTree: Tree;
  private accounts: { [key: number]: Account } = {};
  constructor(stateDepth: number) {
    this.stateTree = Tree.new(stateDepth);
  }

  public getAccount(stateID: number) {
    return { encoded: this.accounts[stateID].encode(), witness: this.stateTree.witness(stateID).nodes };
  }

  public getAccountEncoded(stateID: number) {
    return this.accounts[stateID].encode();
  }

  public getAccountWitness(stateID: number) {
    return this.stateTree.witness(stateID).nodes;
  }

  public createAccount(stateID: number, account: Account) {
    if (this.accounts[stateID]) {
      throw new Error('state id is in use');
    }
    const leaf = account.toStateLeaf();
    this.stateTree.updateSingle(stateID, leaf);
    this.accounts[stateID] = account;
  }

  public get root() {
    return this.stateTree.root;
  }

  public applyBatchType0(txs: Tx0[]): ProofTxBatch {
    let senderAccounts: string[] = [];
    let receiverAccounts: string[] = [];
    let senderWitnesses: string[][] = [];
    let receiverWitnesses: string[][] = [];
    let safe = true;
    for (let i = 0; i < txs.length; i++) {
      if (safe) {
        const proof = this.applyTx0(txs[i]);
        senderAccounts.push(proof.senderAccount);
        senderWitnesses.push(proof.senderWitness);
        receiverAccounts.push(proof.receiverAccount);
        receiverWitnesses.push(proof.receiverWitness);
        safe = proof.safe;
      } else {
        senderAccounts.push(PLACEHOLDER_PROOF_ACC);
        senderWitnesses.push(PLACEHOLDER_PROOF_WITNESS);
        receiverAccounts.push(PLACEHOLDER_PROOF_ACC);
        receiverWitnesses.push(PLACEHOLDER_PROOF_WITNESS);
      }
    }
    return { senderAccounts, senderWitnesses, receiverAccounts, receiverWitnesses, safe };
  }

  public applyTx0(tx: Tx0): ProofTx {
    const senderID = tx.sender;
    const receiverID = tx.receiver;

    const senderAccount = this.accounts[senderID];
    const receiverAccount = this.accounts[receiverID];

    const senderWitness = this.stateTree.witness(senderID).nodes;
    if (senderAccount && receiverAccount) {
      const senderEncoded = senderAccount.encode();
      // FIX: handle burning account
      if (senderAccount.balance < tx.amount || senderAccount.tokenId != receiverAccount.tokenId) {
        return {
          senderAccount: senderEncoded,
          receiverAccount: PLACEHOLDER_PROOF_ACC,
          senderWitness,
          receiverWitness: PLACEHOLDER_PROOF_WITNESS,
          safe: false,
        };
      }

      senderAccount.balance -= tx.amount;
      senderAccount.nonce += 1;
      this.accounts[senderID] = senderAccount;
      this.stateTree.updateSingle(senderID, senderAccount.toStateLeaf());

      const receiverWitness = this.stateTree.witness(receiverID).nodes;
      const receiverEncoded = receiverAccount.encode();
      receiverAccount.balance += tx.amount;
      this.accounts[receiverID] = receiverAccount;
      this.stateTree.updateSingle(receiverID, receiverAccount.toStateLeaf());

      return {
        senderAccount: senderEncoded,
        senderWitness,
        receiverAccount: receiverEncoded,
        receiverWitness,
        safe: true,
      };
    } else {
      if (!senderAccount) {
        return {
          senderAccount: EMPTY_ACCOUNT,
          receiverAccount: PLACEHOLDER_PROOF_ACC,
          senderWitness,
          receiverWitness: PLACEHOLDER_PROOF_WITNESS,
          safe: false,
        };
      }
      const senderEncoded = senderAccount.encode();
      const receiverWitness = this.stateTree.witness(receiverID).nodes;
      return {
        senderAccount: senderEncoded,
        senderWitness,
        receiverAccount: EMPTY_ACCOUNT,
        receiverWitness: receiverWitness,
        safe: false,
      };
    }
  }

  public applyBatchType1(txs: Tx1[]): ProofDepositBatch {
    let accounts: string[] = [];
    let witnesses: string[][] = [];
    let safe = true;
    for (let i = 0; i < txs.length; i++) {
      if (safe) {
        const proof = this.applyTx1(txs[i]);
        accounts.push(proof.account);
        witnesses.push(proof.witness);
        safe = proof.safe;
      } else {
        accounts.push(PLACEHOLDER_PROOF_ACC);
        witnesses.push(PLACEHOLDER_PROOF_WITNESS);
      }
    }
    return { accounts, witnesses, safe };
  }

  public applyTx1(tx: Tx1): ProofDeposit {
    const accountID = tx.accountID;
    const stateID = tx.stateID;
    const account = this.accounts[stateID];
    if (account) {
      // mark transaction as unsafe
      // do not update state
      const witness = this.stateTree.witness(stateID).nodes;
      const encoded = account.encode();
      return { witness, account: encoded, safe: false };
    } else {
      // create proof
      const witness = this.stateTree.witness(stateID).nodes;
      // apply tx
      const amount = tx.amount;
      const tokenID = tx.tokenID;
      const account = Account.new(accountID, tokenID, amount, 0);
      const leaf = account.toStateLeaf();
      this.accounts[stateID] = account;
      this.stateTree.updateSingle(stateID, leaf);
      return { witness, account: EMPTY_ACCOUNT, safe: true };
    }
  }

  public applyBatchType2(txs: Tx2[]): ProofDepositBatch {
    let accounts: string[] = [];
    let witnesses: string[][] = [];
    let safe = true;
    for (let i = 0; i < txs.length; i++) {
      if (safe) {
        const proof = this.applyTx2(txs[i]);
        accounts.push(proof.account);
        witnesses.push(proof.witness);
        safe = proof.safe;
      } else {
        accounts.push(PLACEHOLDER_PROOF_ACC);
        witnesses.push(PLACEHOLDER_PROOF_WITNESS);
      }
    }
    return { accounts, witnesses, safe };
  }

  public applyTx2(tx: Tx2): ProofDeposit {
    const stateID = tx.stateID;
    const account = this.accounts[stateID];
    if (account) {
      // create proof
      const witness = this.stateTree.witness(stateID).nodes;
      const encoded = account.encode();
      // process tx
      const amount = tx.amount;
      const tokenID = tx.tokenID;
      // check frauds
      // fraud vectors:
      // * token id mismatcch
      // * amount overflow
      if (tokenID != account.tokenId) {
        return { witness, account: encoded, safe: false };
      }
      // TODO:
      // if (account.balance > 0x10000000000000000) {
      //   // is not safe
      // }
      // apply tx
      account.balance += amount;
      const leaf = account.toStateLeaf();
      this.stateTree.updateSingle(stateID, leaf);
      return { witness, account: encoded, safe: true };
    } else {
      const witness = this.stateTree.witness(stateID).nodes;
      return { witness, account: EMPTY_ACCOUNT, safe: false };
    }
  }

  public applyBatchType3(txs: Tx3[]): ProofTxBatch {
    let senderAccounts: string[] = [];
    let receiverAccounts: string[] = [];
    let senderWitnesses: string[][] = [];
    let receiverWitnesses: string[][] = [];
    let safe = true;
    for (let i = 0; i < txs.length; i++) {
      if (safe) {
        const proof = this.applyTx3(txs[i]);
        senderAccounts.push(proof.senderAccount);
        senderWitnesses.push(proof.senderWitness);
        receiverAccounts.push(proof.receiverAccount);
        receiverWitnesses.push(proof.receiverWitness);
        safe = proof.safe;
      } else {
        senderAccounts.push(PLACEHOLDER_PROOF_ACC);
        senderWitnesses.push(PLACEHOLDER_PROOF_WITNESS);
        receiverAccounts.push(PLACEHOLDER_PROOF_ACC);
        receiverWitnesses.push(PLACEHOLDER_PROOF_WITNESS);
      }
    }
    return { senderAccounts, senderWitnesses, receiverAccounts, receiverWitnesses, safe };
  }

  public applyTx3(tx: Tx3): ProofTx {
    const senderID = tx.sender;
    const receiverID = tx.receiver;

    const senderAccount = this.accounts[senderID];
    const receiverAccount = this.accounts[receiverID];

    const senderWitness = this.stateTree.witness(senderID).nodes;
    const senderEncoded = senderAccount.encode();

    if (senderAccount) {
      if (!receiverAccount) {
        if (senderAccount.balance < tx.amount) {
          return {
            senderAccount: senderEncoded,
            receiverAccount: PLACEHOLDER_PROOF_ACC,
            senderWitness,
            receiverWitness: PLACEHOLDER_PROOF_WITNESS,
            safe: false,
          };
        }

        senderAccount.balance -= tx.amount;
        senderAccount.nonce += 1;
        this.accounts[senderID] = senderAccount;
        this.stateTree.updateSingle(senderID, senderAccount.toStateLeaf());

        const receiverWitness = this.stateTree.witness(receiverID).nodes; // must be a witness for empty account
        const receiverAccountID = tx.accountID;
        const newReceiverAccount = Account.new(receiverAccountID, senderAccount.tokenId, tx.amount, 0);

        this.accounts[receiverID] = newReceiverAccount;
        const newStateHash = newReceiverAccount.toStateLeaf();
        this.stateTree.updateSingle(receiverID, newStateHash);

        return {
          senderAccount: senderEncoded,
          senderWitness,
          receiverAccount: EMPTY_ACCOUNT,
          receiverWitness,
          safe: true,
        };
      } else {
        senderAccount.balance -= tx.amount;
        senderAccount.nonce += 1;
        this.accounts[senderID] = senderAccount;
        this.stateTree.updateSingle(senderID, senderAccount.toStateLeaf());

        const receiverWitness = this.stateTree.witness(receiverID).nodes;
        const receiverEncoded = receiverAccount.encode();

        return {
          senderAccount: senderEncoded,
          senderWitness,
          receiverAccount: receiverEncoded,
          receiverWitness,
          safe: false,
        };
      }
    } else {
      return {
        senderAccount: EMPTY_ACCOUNT,
        receiverAccount: PLACEHOLDER_PROOF_ACC,
        senderWitness,
        receiverWitness: PLACEHOLDER_PROOF_WITNESS,
        safe: false,
      };
    }
  }
}
