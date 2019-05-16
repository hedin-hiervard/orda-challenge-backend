#!/usr/bin/env node
import Youch from 'youch'
import forTerminal from 'youch-terminal'
import { StreamLogger } from 'ual'

export const log = new StreamLogger({ stream: process.stdout, colors: true })

process.on('unhandledRejection', err => {
    throw err
})

process.on('uncaughtException', err => {
    new Youch(err, {})
        .toJSON()
        .then((output) => {
            log.error(forTerminal(output))
        })
})

log.debug('started')
