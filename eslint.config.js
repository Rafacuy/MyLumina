const globals = require('globals');

module.exports = [
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.commonjs,
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-process-exit': 'off',
            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'no-var': 'error',
            'prefer-const': 'error',
            semi: ['error', 'always'],
            quotes: ['error', 'single', { avoidEscape: true }],
            indent: ['error', 4, { SwitchCase: 1 }],
            'max-len': ['warn', { code: 120 }],
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never'],
            'comma-dangle': ['error', 'always-multiline'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
        },
        ignores: [
            'node_modules/**',
            'logs/**',
            '*.log',
            '.env',
            '.env.example',
            '*.json',
            'data/memory.json',
            'data/relationState.json',
            'temp_images/**',
            'assets/**',
            'eslint.config.js',
            '.prettierrc',
            'package-lock.json',
        ],
    },
];
