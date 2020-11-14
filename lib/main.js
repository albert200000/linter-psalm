'use babel';

import { CompositeDisposable } from 'atom';

// Dependencies
let helpers;
let path;

const loadDeps = () => {
  if (!helpers) {
    helpers = require('atom-linter');
  }

  if (!path) {
    path = require('path');
  }
};

export default {
  activate() {
    this.idleCallbacks = new Set();
    let depsCallbackID;
    const installLinterPhpDeps = () => {
      this.idleCallbacks.delete(depsCallbackID);

      if (!atom.inSpecMode()) {
        require('atom-package-deps').install('linter-psalm');
      }

      loadDeps();
    };
    depsCallbackID = window.requestIdleCallback(installLinterPhpDeps);
    this.idleCallbacks.add(depsCallbackID);

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.config.observe('linter-psalm.executablePath', (value) => {
        this.executablePath = value;
      })
    );
  },

  deactivate() {
    this.idleCallbacks.forEach((callbackID) => window.cancelIdleCallback(callbackID));
    this.idleCallbacks.clear();
    this.subscriptions.dispose();
  },

  provideLinter() {
    return {
      name: 'Psalm',
      grammarScopes: ['text.html.php', 'source.php'],
      scope: 'file',
      lintsOnChange: true,
      lint: async (textEditor) => {
        if (!atom.workspace.isTextEditor(textEditor)) {
          return null;
        }

        const filePath = textEditor.getPath();
        const fileText = textEditor.getText();

        // Ensure that the dependencies are loaded
        loadDeps();

        const parameters = [
          '--no-diff',
          '--no-progress',
          '--output-format=text',
          filePath
        ];

        const execOptions = {
          stdin: fileText,
          ignoreExitCode: true
        };

        if (filePath) {
          // Only specify a CWD if the file has been saved
          const [projectPath] = atom.project.relativizePath(filePath);
          execOptions.cwd = projectPath !== null ? projectPath : path.dirname(filePath);
        }

        const output = await helpers.exec(this.executablePath, parameters, execOptions);

        if (textEditor.getText() !== fileText) {
          // Editor contents have changed, don't update messages
          return null;
        }

        const messages = [];
        const parseRegex = /.+:(\d+):\d+:(.+)\s-\s(.+)/g;
        let match = parseRegex.exec(output);

        while (match !== null) {
          const line = Number.parseInt(match[1], 10) - 1;
          const errorType = match[2];

          messages.push({
            severity: (/error/i.test(errorType) ? 'error' : 'warning'),
            location: {
              file: filePath,
              position: helpers.generateRange(textEditor, line),
            },
            excerpt: match[3],
          });

          match = parseRegex.exec(output);
        }

        return messages;
      },
    };
  }
};
