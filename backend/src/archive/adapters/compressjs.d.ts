declare module 'compressjs' {
    const compressjs: {
        Bzip2: {
            compressFile(input: Uint8Array): Uint8Array
            decompressFile(input: Uint8Array): Uint8Array
        }
    }
    export default compressjs
}
