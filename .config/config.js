const { join } = require('path');

const main = 'dist/vpos-dashboard.js';
const name = "vposdashboard";
const title = 'PSS 5000 GVR VPOS DASHBOARD';
const project = 'gvr-vpos-dashboard';
const domsAppId = '472-80';
const pid = 'vpos.pid';
const section = 'base';
const priority = 'optional';
const appStartGrep = '[v]pos-dashboard.js';
const dependencies = '';

const environmentVariables = { PROD: 'true' };

const descriptionSml =
	'A tiny, low-resource dashboard for DOMS PSS 5000 that exposes basic machine stats and renders them in a lightweight HTML/CSS/JS UI.'

const description = descriptionSml

const limitations = `
  None
`;

const installGuide = `
  Install the package via the FccWebApp "5.2 Software Update" page.
  Please consult the installation, configuration and user manuals.
`;

const installationSteps = [
    {
        title: "Upgrade process: ",
        steps: [
            "Install the package provided in this email using the FccWebApp '5.2 Software Update' page.",
            "Make sure your DOMS PSS 5000 is connected to the internet.",
            "Make sure your EPSON printer is connected to the same network DOMS PSS 5000.",
        ]
    }
]

const emailListTo = ['bhenning@dearx.co.za'];
const emailListCC = ['']

const changelogFile = join(process.cwd(), '.config', 'changelog.log');
const archiveFile = join(process.cwd(), '.config', 'changelog.archive.log');
// Exclude items from staging into .builder/build (root-level names)
const exclude = ["src", "tests", "node_modules", "scripts", "azure-pipelines.yml", "config.json", "tsconfig.json", "tslint.json", ".gitignore"];

const config = {
    name,
    main,
    title,
    project,
    domsAppId,
    pid,
    section,
    priority,
    appStartGrep,
    dependencies,
    description,
    descriptionSml,
    limitations,
    installGuide,
    changelogFile,
    archiveFile,
    emailListTo,
    emailListCC,
    environmentVariables,
    installationSteps,
    exclude
};

module.exports = {
    config
};