#!/usr/bin/env node
import '@babel/polyfill'
import Youch from 'youch'
import forTerminal from 'youch-terminal'
import { StreamLogger } from 'ual'
import dotenv from 'dotenv'

import Server from 'server'

export const log = new StreamLogger({ stream: process.stdout, colors: true })

dotenv.config()

process.on('unhandledRejection', err => {
    throw err
})

process.on('uncaughtException', err => {
    new Youch(err, {})
        .toJSON()
        .then((output) => {
            log.error(forTerminal(output))
        })
});

(async function() {
    if(process.env.BACKEND_PORT == null) {
        throw new Error('BACKEND_PORT env var is undefined')
    }
    if(process.env.DATA_FILE == null) {
        throw new Error('DATA_FILE env var is undefined')
    }
    if(process.env.FRONTEND_URI == null) {
        throw new Error('FRONTEND_URI env var is undefined')
    }
    const server = new Server({
        port: process.env.BACKEND_PORT,
        log,
        dataFile: process.env.DATA_FILE,
        frontendURI: process.env.FRONTEND_URI,
    })
    await server.start()
})()
