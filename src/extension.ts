import * as vscode from 'vscode';
import untildify from 'untildify';
import * as tmp from 'tmp';
import * as child_process from 'child_process';
import * as fs from "fs";
import * as util from './util';

export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "ansible-vault-inline" is now active!');

	var toggleEncrypt = async () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		let selection = editor.selection;
		if (!selection) {
			return;
		}

		let vaultConfig = await resolveVaultConfig(editor);
		let doc = editor.document;

		const text = editor.document.getText(selection);

		try {
			// Go encrypt / decrypt
			if (!!text) {
				let type = getInlineTextType(text);

				if (type === 'plaintext') {
					console.log(`Encrypt selected text`);

					let encryptedText = "!vault |\n"+encryptInline(text, vaultConfig.rootPath, vaultConfig.keyInCfg, vaultConfig.keypath, vaultConfig.config, await encryptVaultId(vaultConfig.vaultIds));
					editor.edit(editBuilder => {
						editBuilder.replace(selection, encryptedText.replace(/\n/g,'\n'+" ".repeat(selection.start.character)));
					});
				} else if (type === 'encrypted') {
					console.log(`Decrypt selected text`);

					let decryptedText = decryptInline(text, vaultConfig.rootPath, vaultConfig.keyInCfg, vaultConfig.keypath, vaultConfig.config);
					editor.edit(editBuilder => {
						editBuilder.replace(selection, decryptedText);
					});
				}
			} else {
				let content = '';
				await vscode.workspace.openTextDocument(doc.fileName).then((document) => {
					content = document.getText();
				});
				let type = getTextType(content);

				if (type === 'plaintext') {
					console.log(`Encrypt entire file`);

					encryptFile(doc.fileName, vaultConfig.rootPath, vaultConfig.keyInCfg, vaultConfig.keypath, vaultConfig.config, await encryptVaultId(vaultConfig.vaultIds));
					vscode.window.showInformationMessage(`File encrypted: '${doc.fileName}'`);
				} else if (type === 'encrypted') {
					console.log(`Decrypt entire file`);

					decryptFile(doc.fileName, vaultConfig.rootPath, vaultConfig.keyInCfg, vaultConfig.keypath, vaultConfig.config);
					vscode.window.showInformationMessage(`File decrypted: '${doc.fileName}'`);
				}
			}
		} finally {
			removeTemporaryPassFile(vaultConfig.pass, vaultConfig.keypath);
		}
	};

	var copyDecryptedSelection = async () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		let selection = editor.selection;
		if (!selection || selection.isEmpty) {
			vscode.window.showWarningMessage("No text selected. Select an inline vault block first.");
			return;
		}

		const text = editor.document.getText(selection);
		if (!text) {
			vscode.window.showWarningMessage("No text selected. Select an inline vault block first.");
			return;
		}

		if (getInlineTextType(text) !== 'encrypted') {
			vscode.window.showWarningMessage("Selected text does not look like an encrypted ansible-vault inline block.");
			return;
		}

		let vaultConfig = await resolveVaultConfig(editor);
		try {
			let decryptedText = decryptInline(text, vaultConfig.rootPath, vaultConfig.keyInCfg, vaultConfig.keypath, vaultConfig.config);
			await vscode.env.clipboard.writeText(decryptedText);
			vscode.window.showInformationMessage("Copied decrypted text to clipboard. Source file was not modified.");
		} finally {
			removeTemporaryPassFile(vaultConfig.pass, vaultConfig.keypath);
		}
	};

	var selectVaultId = async () => {
		console.log('Trying to write VaultID into settings');

		let editor = vscode.window.activeTextEditor;
		let rootPath = undefined;
		if (!!editor) {
			rootPath = util.getRootPath(editor.document.uri);
		} else {
			vscode.window.showWarningMessage("No editor opened! Failed to determine current workspace root folder");
		}
		let config = vscode.workspace.getConfiguration('ansibleVaultInline');

		let keyInCfg: string, vaultIds: false|Array<string>;
		[keyInCfg, vaultIds] = util.scanAnsibleCfg(rootPath);
        // Try to get vault list from workspace config
		if (!keyInCfg && !!config.keyfile && isVaultIdList(config.keyfile)){
			vaultIds = util.getVaultIdList(config.keyfile);
		}
		if (!vaultIds || !vaultIds.length) {
			vscode.window.showWarningMessage(`Couldn't find proper 'vault_identity_list' in your config files`);
			return;
		}
		let selection = await chooseVaultId(vaultIds);
		if (!!selection){
			config.update('encryptVaultId', selection, false);
			vscode.window.showInformationMessage(`'encrypt_vault_id' is set to '${selection}'`);
		}
	};

	var clearVaultIdSelection = async () => {
		console.log(`Clear 'encryptVaultId' setting`);
		let config = vscode.workspace.getConfiguration('ansibleVaultInline');
		config.update('encryptVaultId', "", false);
		vscode.window.showInformationMessage(`'encrypt_vault_id' is set to ''`);
	};

	let disposable = vscode.commands.registerCommand('extension.ansibleVaultInline', toggleEncrypt);
	context.subscriptions.push(disposable);

	let copyDecryptedSelectionCommand = vscode.commands.registerCommand('extension.ansibleVaultInline.copyDecryptedSelection', copyDecryptedSelection);
	context.subscriptions.push(copyDecryptedSelectionCommand);

    let selectVaultIdCommand = vscode.commands.registerCommand('extension.ansibleVaultInline.selectVaultId', selectVaultId);
	context.subscriptions.push(selectVaultIdCommand);

	let clearVaultIdSelectionCommand = vscode.commands.registerCommand('extension.ansibleVaultInline.clearVaultIdSelection', clearVaultIdSelection);
	context.subscriptions.push(clearVaultIdSelectionCommand);
}

export function deactivate() {}

let resolveVaultConfig = async (editor: vscode.TextEditor) => {
	let config = vscode.workspace.getConfiguration('ansibleVaultInline');
	let keypath = "";
	let pass : any = "";
	let rootPath = util.getRootPath(editor.document.uri);
	let keyInCfg: string, vaultIds: false|Array<string>;
	[keyInCfg, vaultIds] = util.scanAnsibleCfg(rootPath);

	if (!!keyInCfg) {
		console.log(`Getting vault keyfile from ${keyInCfg}`);
		vscode.window.showInformationMessage(`Getting vault keyfile from ${keyInCfg}`);
	} else {
		console.log(`Found nothing from config files`);

		if (!!config.keyfile) {

			if (isVaultIdList(config.keyfile)){
				keypath = config.keyfile.trim();
				vaultIds = util.getVaultIdList(keypath);

			} else {
				keypath = untildify(config.keyfile.trim());
			}
		}

		// Need user to input the ansible-vault pass
		if (!keypath) {
			pass = config.keypass;

			if (!pass) {
				await vscode.window.showInputBox({ prompt: "Enter the ansible-vault keypass: " }).then((val) => {
					pass = val;
				});
			}

			keypath = tmp.tmpNameSync();
			fs.writeFileSync(keypath, pass, 'utf8');
			console.log(`Wrote password to temporary file: '${keypath}'`);
		}
	}

	return {
		config,
		rootPath,
		keyInCfg,
		keypath,
		pass,
		vaultIds
	};
};

let removeTemporaryPassFile = (pass: any, keypath: string) => {
	if (!!pass && !!keypath && fs.existsSync(keypath)) {
		fs.unlinkSync(keypath);
		console.log(`Removed temporary file: '${keypath}'`);
	}
};

// Returns wheter the selected text is encrypted or in plain text.
let getInlineTextType = (text : string) => {
	if (text.trim().startsWith('!vault |')) {
		text = text.replace('!vault |', '');
	}

	return (text.trim().startsWith('$ANSIBLE_VAULT;')) ? 'encrypted' : 'plaintext';
};

// Returns wheter the file is encrypted or in plain text.
let getTextType = (text : string) => {
	return (text.indexOf('$ANSIBLE_VAULT;') === 0) ? 'encrypted' : 'plaintext';
};

let encryptInline = (text : string, rootPath : string | undefined, keyInCfg : string, pass : string, config : vscode.WorkspaceConfiguration, encryptVaultId : any) => {
	let tmpFilename = tmp.tmpNameSync();
	fs.writeFileSync(tmpFilename, Buffer.from(text, 'utf8'));
	console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

	encryptFile(tmpFilename, rootPath, keyInCfg, pass, config, encryptVaultId);
	let encryptedText = fs.readFileSync(tmpFilename, 'utf8');
	console.log(`encryptedText == '${encryptedText}'`);

	if (!!tmpFilename) {
		fs.unlinkSync(tmpFilename);
		console.log(`Removed temporary file: '${tmpFilename}'`);
	}

	return encryptedText.trim();
};

let decryptInline = (text : string, rootPath : string | undefined, keyInCfg : string, pass : string, config : vscode.WorkspaceConfiguration) => {
	// Delete inline vault prefix, then trim spaces and newline from the entire string and, at last, trim the spaces in the multiline string.
	text = text.replace('!vault |', '').trim().replace(/[^\S\r\n]+/gm, '');

	let tmpFilename = tmp.tmpNameSync();
	fs.writeFileSync(tmpFilename, Buffer.from(text, 'utf8'));
	console.log(`Wrote encrypted string to temporary file '${tmpFilename}'`);

	decryptFile(tmpFilename, rootPath, keyInCfg, pass, config);
	let decryptedText = fs.readFileSync(tmpFilename, 'utf8');
	console.log(`decryptedText == '${decryptedText}'`);

	if (!!tmpFilename) {
		fs.unlinkSync(tmpFilename);
		console.log(`Removed temporary file: '${tmpFilename}'`);
	}

	return decryptedText;
};

let encryptFile = (f : string, rootPath : string | undefined, keyInCfg : string, pass : string, config : vscode.WorkspaceConfiguration, encryptVaultId : any) => {
	console.log(`Encrypt file: ${f}`);

	let cmd = `${config.executable} encrypt "${f}"`;
	// Specify vault-password-file or vault-IDs when vault parameters is not in `ansible.cfg`.
	if (!keyInCfg) {
		cmd += buildCmdArgs(pass);
	}
	if (!!encryptVaultId){
		cmd += ` --encrypt-vault-id ${encryptVaultId}`;
	}

	if (!!rootPath) {
		exec(cmd, { cwd: rootPath });
	} else {
		exec(cmd);
	}
};

let decryptFile = (f : string, rootPath : string | undefined, keyInCfg : string, pass : string, config : vscode.WorkspaceConfiguration) => {
	console.log(`Decrypt file: ${f}`);

	let cmd = `${config.executable} decrypt "${f}"`;
	// Specify vault-password-file or vault-IDs when vault parameters is not in `ansible.cfg`.
	if (!keyInCfg) {
		cmd += buildCmdArgs(pass);
	}

	if (!!rootPath) {
		exec(cmd, { cwd: rootPath });
	} else {
		exec(cmd);
	}
};

let exec = (cmd : string, opt = {}) => {
	console.log(`> ${cmd}`);
	return child_process.execSync(cmd, opt);
};

let encryptVaultId = async (vaultIds: false|Array<string>) => {
	if (!vaultIds){
		return "";
	}
	let config = vscode.workspace.getConfiguration('ansibleVaultInline');
	if (!!config.get('encryptVaultId') && vaultIds.includes(config.encryptVaultId)) {
		return config.encryptVaultId;
	}
	if (vaultIds.length === 1) {
		return vaultIds[0];
	}
	return chooseVaultId(vaultIds);
};

let chooseVaultId = async (vaultIds: Array<string>) => {
	return vscode.window.showQuickPick(vaultIds, { placeHolder: "Choose ansible vault ID for encryption: ", canPickMany: false});
};

let isVaultIdList = (string : string) => {
	return string.includes('@');
};

let buildCmdArgs = (pass : string) =>{
	// check that it's vault id list
	if (isVaultIdList(pass)) {
		//return `--vault-id "vault1@vault1-key-path" --vault-id "vault2@vault2-key-path"`
		return pass.split(',').map(element => {
			return ` --vault-id "${element.trim()}"`;
		}).join('');
	}
	return ` --vault-password-file="${pass}"`;
};