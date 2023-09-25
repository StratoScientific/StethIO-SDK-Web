const { resolve } = require('path')
module.exports = {
    mode:'production',
    entry: './src/audio-engine.ts',
    output: {
        path: resolve(__dirname, './dist'),
        filename: 'prod.js',
        library: "AudioEngine",
        libraryTarget: 'umd',
        globalObject: 'this'

    },
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
}