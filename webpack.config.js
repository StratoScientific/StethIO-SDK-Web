const { resolve } = require('path')
module.exports = {
    entry: '.index.js',
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_module/,
                use: 'ts-loader'
            }]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    target: 'node',
    devtool:'source-map',
    mode: 'production'
}