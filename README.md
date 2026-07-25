# VSCode ansible-vault-inline extension

[![Version Badge](https://img.shields.io/vscode-marketplace/v/wolfmah.ansible-vault-inline.svg?style=flat-square&label=marketplace)](https://marketplace.visualstudio.com/items?itemName=wolfmah.ansible-vault-inline)
[![Installs Badge](https://img.shields.io/vscode-marketplace/i/wolfmah.ansible-vault-inline.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=wolfmah.ansible-vault-inline)
[![Rating Badge](https://img.shields.io/vscode-marketplace/r/wolfmah.ansible-vault-inline.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=wolfmah.ansible-vault-inline)
[![License Badge](https://img.shields.io/badge/License-MPL%202.0-blue.svg?style=flat-square)](https://www.mozilla.org/en-US/MPL/2.0/)

VSCode extensions to encrypt/decrypt `ansible-vault` file as well as selected text. Can toggle with <kbd>`ctl+alt+0`</kbd>, on macOS with <kbd>`cmd+alt+0`</kbd>, or via the contextual menu.

If you want to copy secrets without writing plain text into your source file, use the command **"Copy decrypted selected inline vault to clipboard (source unchanged)"** (default shortcut: <kbd>`ctrl+alt+9`</kbd> / <kbd>`cmd+alt+9`</kbd>). It decrypts the current selection and only writes the result to the clipboard.

_Fork of [dhoeric/vscode-ansible-vault](https://github.com/dhoeric/vscode-ansible-vault), which in turn was inspired by [sydro/atom-ansible-vault](https://github.com/sydro/atom-ansible-vault)_


## Usage

To read vault password file in your computer, you can specify the `vault_password_file` in ansible.cfg or through [extension settings](#extension-settings).

### _Experimental: Vault ID_

You can use `vault_identity_list` in ansible.cfg or through [extension settings](#extension-settings), e.g. `dev@path/to/dev.key, prod@path/to/prod.key` instead of vault password, drop-down box with a list of your vault identities will appear during encryption.

To memorize encrypt-vault-id, use `ansibleVaultInline.encryptVaultId` setting or <kbd>`ctl+alt+=`</kbd>, on macOS <kbd>`cmd+alt+=`</kbd>, that's the way you can switch between vault IDs. To reset this setting and back to default mode (ask vault id before encryption) you can use <kbd>`cmd+alt+-`</kbd>

To learn more about Vault IDs, please read [RH learn article](https://learn.redhat.com/t5/Automation-Management-Ansible/Vault-IDs-in-Ansible-2-4/td-p/1531) or official Ansible docs.


## Requirements

- Ansible


## Extension Settings

This extension contributes the following settings:

* `ansibleVaultInline.executable`: Full path of ansible-vault executable (e.g. `/usr/local/bin/ansible-vault`)
* `ansibleVaultInline.keyfile`: Ansible-vault password file path or vaul id list (e.g. `~/.vault-pass.txt` or `dev@~/dev.key, prod@~/prod.key` )
* `ansibleVaultInline.keypass`: Ansible-vault password text (e.g. `GT6rAP7rxYzeFC1KtHVW`)
* `ansibleVaultInline.encryptVaultId`: Ansible vault ID used for encryption by default (e.g. `dev`)


## Developement

### Build

```
npm install
npm run compile
```

### Publish

* Change version
```
npm version [major|minor|patch] --no-git-tag-version
```
* Update `CHANGELOG.md`
* Publish the extension. See documentation for more info on how to login and for more advance options: [VSCode: Publishing Extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
```
vsce publish --pat X_PERSONAL_ACCESS_TOKEN_X
```
* Create a tag
```
git tag x.x.x
git push origin x.x.x
```
* Create a release in Gitlab
```
curl --header 'Content-Type: application/json' --header "PRIVATE-TOKEN: X_ACCESS_TOKEN_X" --data '{ "name": "Release x.x.x", "tag_name": "x.x.x", "description": "# CHANGELOG\n## [x.x.x] - 2019-10-21\n### Added\n- Initial release" }' --request POST https://gitlab.com/api/v4/projects/14922723/releases
```
