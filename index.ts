const environment = process.env.NODE_ENV || 'dev';
require('dotenv').config({ path: `.env.${environment}` });

import { program } from 'commander'
import Web3, { KeyStore, eth } from "web3"
import passwordPrompt from 'password-prompt'
import fs from 'fs'
import prompt from 'prompt-sync'

// global vars
let keystores: KeyStore[];
const web3 = new Web3(process.env.NETWORK);
const keystoresFilePath = `./data/keystores.${environment}.json`

const init = () => {
    const keyStoresString = fs.readFileSync(keystoresFilePath, 'utf-8')
    keystores = JSON.parse(keyStoresString);
}

const saveKeystores = () => {
    const keyStoresString = JSON.stringify(keystores);
    fs.writeFileSync(keystoresFilePath, keyStoresString);
}


const getBalance = (address: string): Promise<string> =>
    new Promise((resolve, reject) => {
        web3.eth.getBalance(address)
            .then(balance =>
                resolve(web3.utils.fromWei(balance, 'ether'))
            ).catch(error => {
                reject(error);
            })
    })

const list = async () => {
    console.log("Your local accounts:")

    const display = await Promise.all(keystores.map(async (e) => {
        const address = "0x" + e.address;
        return {
            address: address,
            balance: await getBalance(address)
        };
    }));
    console.table(display)
}

program
    .version('1.0.0')
    .description('A rudimentary eth wallet.');

program
    .command('list')
    .description('list local accounts')
    .action(list);


program
    .command('balance <address>')
    .description('get balance of given address')
    .action((address) => {
        getBalance(address)
            .then((balance) => {
                console.log(`Wallet Balance for ${address}:`, balance, 'ETH');
            })
            .catch((error) => {
                console.error(`Error checking balance for ${address} ${error}`);
            });
    })

program
    .command('new')
    .description('create a new account and secure it')
    .action(async () => {
        const newAccount = web3.eth.accounts.create()
        console.log(`Your new account: ${newAccount.address}`)
        const pass = await passwordPrompt('Please enter a password to secure it:\n', { method: 'hide' });
        const keystore = await newAccount.encrypt(pass);
        keystores.push(keystore)
        saveKeystores();
        console.log("Your new account was created succesfully")
    })

program
    .command('import')
    .description('import already existing account')
    .action(async () => {
        let newAccount: eth.accounts.Web3Account;
        const privateKey = await passwordPrompt('Please enter your private key to import the account:\n', { method: 'hide' })
        try {
            newAccount = web3.eth.accounts.privateKeyToAccount(privateKey)
        } catch (error) {
            console.error("Invalid private key");
            return;
        }
        const pass = await passwordPrompt('Please enter a password to secure it:\n', { method: 'hide' });
        const keystore = await newAccount.encrypt(pass);
        keystores.push(keystore)
        saveKeystores();
        console.log("Your account was imported succesfully")
    })

program.command('send')
    .description('send ETH to an account')
    .action(async () => {
        await list()
        const sender: string = prompt()('Account to send from:').trim()
        const senderKeystore = keystores.find((e) => e.address == sender.substring(2));
        if (!senderKeystore) {
            console.error("No such account inside the wallet");
            return;
        }
        const pass = await passwordPrompt(`Unlock account ${senderKeystore.address}:\n`, { method: 'hide' })
        let senderAccount: eth.accounts.Web3Account;
        try {
            senderAccount = await web3.eth.accounts.decrypt(JSON.stringify(senderKeystore), pass);
        } catch (error) {
            console.error("Unable to unlock account, invalid password");
            return;
        }

        const receiver: string = prompt()('Account to send to: ').trim()

        const amount: number = +prompt()('Amount: ').trim()
        const transactionObject = {
            from: senderAccount.address,
            to: receiver,
            value: web3.utils.toWei(amount, 'ether'),
            gasPrice: await web3.eth.getGasPrice() 
        };
        const gasEstimate = await web3.eth.estimateGas(transactionObject)

        const finalTransaction = {...transactionObject, gas: gasEstimate};
        senderAccount.signTransaction(finalTransaction).then((tx) => {
            web3.eth.sendSignedTransaction(tx.rawTransaction)
                .on('receipt', (receipt) => {
                    console.log('Transaction Receipt:', receipt);
                })
                .on('error', (error) => {
                    console.error('Error sending transaction:', error);
                });
        })
            .catch((error) => {
                console.error(error);
            });
    })

init()
program.parse(process.argv)