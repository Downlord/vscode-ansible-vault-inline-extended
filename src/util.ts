import * as vscode from 'vscode';
import * as fs from 'fs';
import untildify from 'untildify';
import * as ini from 'ini';

// Get rootPath based on multi-workspace API
export function getRootPath(editorDocumentUri : vscode.Uri) {
    let rootPath : string | undefined = undefined;

    if (!!vscode.workspace.workspaceFolders) {
        rootPath = vscode.workspace.workspaceFolders.length ? vscode.workspace.workspaceFolders[0].name : undefined;
    }

    if (!!vscode.workspace.getWorkspaceFolder) {
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(editorDocumentUri);

        if (!!workspaceFolder) {
            rootPath = workspaceFolder.uri.path;
        } else {
            // not under any workspace
            rootPath = undefined;
        }
    }

    return rootPath;
}

export function scanAnsibleCfg(rootPath : any = undefined) {
    console.log(`util.scanAnsibleCfg(${rootPath})`);

    /*
     * Reading order:
     * 1) ANSIBLE_CONFIG
     * 2) ansible.cfg (in current workspace)
     * 3) ~/.ansible.cfg
     * 4) /etc/ansible.cfg
     */
    let cfgFiles = [
        `~/.ansible.cfg`,
        `/etc/ansible.cfg`
    ];

    if (!!rootPath) {
        cfgFiles.unshift(`${rootPath}/ansible.cfg`);
    }

    if (!!process.env.ANSIBLE_CONFIG) {
        cfgFiles.unshift(process.env.ANSIBLE_CONFIG);
    }

    let result: [string, false|Array<string>] = ['', false];

    for (let i = 0; i < cfgFiles.length; i++) {
        let cfgFile = cfgFiles[i];
        let cfgPath = untildify(cfgFile);

        let cfg = getValueByCfg(cfgPath);
        if (!!cfg && !!cfg.defaults) {

            if (!!cfg.defaults.vault_password_file && !!cfg.defaults.vault_identity_list) {
                console.log(`Found 'vault_password_file' and 'vault_identity_list' within '${cfgPath}', add 'default' to vault id list`);
                // If 'vault_password_file' and 'vault_identity_list' are in `ansible.cfg` simultaneously,
                // ansible adds special 'default' ID to the list of vault IDs.
                let vaultIdList = getVaultIdList(cfg.defaults.vault_identity_list);
                if (!vaultIdList.includes('default')){
                    vaultIdList.push('default');
                }
                result = [cfgPath, vaultIdList];
                return result;
            }
            if (!!cfg.defaults.vault_password_file) {
                console.log(`Found 'vault_password_file' within '${cfgPath}'`);
                result = [cfgPath, false];
                return result;
            }
            if (!!cfg.defaults.vault_identity_list) {
                console.log(`Found 'vault_identity_list' within '${cfgPath}'`);
                let vaultIdList = getVaultIdList(cfg.defaults.vault_identity_list);
                result = [cfgPath, vaultIdList];
                return result;
            }
        }
    }

    console.log(`Found no 'defaults.vault_password_file' or 'defaults.vault_identity_list' within config files`);
    return result;
}

let getValueByCfg = (path: any) => {
    console.log(`Reading '${path}'...`);

    if (fs.existsSync(path)) {
        return ini.parse(fs.readFileSync(path, 'utf-8'));
    }

    return undefined;
};

export function getVaultIdList(idlist: string) {
    /*
    Return array of vault IDs. Fox example, for this string in ansible config:
    vault_identity_list = dev@~/.ansible/dev.key, prod@~/.ansible/prod.key
    it returns ['dev', 'prod']
    */
    return idlist.split(',').map(element => {
        return element.trim().split('@')[0];
    });
}
