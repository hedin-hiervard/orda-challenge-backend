import fs from 'fs-extra'
import graphqlHTTP from 'express-graphql'
import express from 'express'
import { makeExecutableSchema } from 'graphql-tools'
import _ from 'lodash'
import moment from 'moment'
import cors from 'cors'
import nodemailer from 'nodemailer'

const typeDefs = `
    type Venue {
        id: String!
        name: String!
    }

    type Result {
        success: Boolean!,
        msg: String
    }

    type Order {
        time: String!
        tipSum: Float!
        sumTotal: Float!
        venueId: String!
        venueName: String!
    }

    type Day {
        startTimestamp: String!
    }

    type Query {
        days: [ Day ]
        venues: [ Venue ]
        orders(venueId: String): [ Order ]
    }
    type Mutation {
        sendReport(
            email: String!
            dayStartTimestamp: String!
            venueId: String!
        ): Result!
    }
`
export default class Server {
    constructor({ port, log, dataFile, frontendURI }) {
        this.port = port
        this.log = log
        this.dataFile = dataFile
        this.frontendURI = frontendURI
    }

    async start() {
        this.log.info(`reading dataFile: ${this.dataFile}`)
        this.data = fs.readFileSync(this.dataFile, 'utf-8')
        this.data = JSON.parse(this.data)
        if(!Array.isArray(this.data)) {
            throw new Error(`corrupt data.json, array expected as root element`)
        }
        this.log.info(`successfully read ${this.data.length} entries from data file`)

        this.log.info(`creating mail transport`)
        const testAccount = await nodemailer.createTestAccount()

        this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        })

        const resolvers = {
            Mutation: {
                sendReport: async (obj, args) => {
                    this.log.debug(args)
                    const dayStart = moment.unix(args.dayStartTimestamp)
                    const dayEnd = dayStart.clone().endOf('day')
                    const email = args.email
                    this.log.debug(dayStart.format())
                    this.log.debug(dayEnd.format())
                    const subject = `Report For ${dayStart.format('MMMM Do YYYY')}`
                    const result = this.data
                        .filter(order => {
                            const om = moment.unix(order.time)
                            return om.isAfter(dayStart) && om.isBefore(dayEnd)
                        })
                        .reduce((acc, next) => ({
                            ordersCount: acc.ordersCount + 1,
                            totalTurnover: acc.totalTurnover + next.sumTotal,
                            totalTips: acc.totalTips + next.tipSum,
                        }),
                        {
                            ordersCount: 0,
                            totalTurnover: 0,
                            totalTips: 0,
                        })
                    this.log.debug(result)
                    const text = `Orders: ${result.ordersCount}\nTotal Turnover: ${result.totalTurnover}\nTotal Tips: ${result.totalTips}`
                    const info = await this.transporter.sendMail({
                        from: 'Reporting <reporting_bot@example.com>', // sender address
                        to: args.email,
                        subject,
                        text,
                    })
                    const url = nodemailer.getTestMessageUrl(info)
                    if(!url) {
                        return {
                            success: false,
                            msg: 'Failed to send report',
                        }
                    }
                    return {
                        success: true,
                        msg: url,
                    }
                },
            },
            Query: {
                days: (obj) => {
                    let days = this.data
                        .map(order => moment.unix(order.time).startOf('day'))
                    days = days
                        .map(m => ({
                            startTimestamp: m.unix(),
                        }))
                    days = _.uniqBy(days, day => day.startTimestamp)
                    return days
                },
                venues: () => {
                    let result = this.data
                    result = _.uniqBy(result, order => order.venueId)
                    result = result
                        .map(order => ({
                            name: order.venueName.venue,
                            id: order.venueId,
                        })
                        )
                    return result
                },
                orders: (obj, args) => {
                    let result = this.data
                    if(args.venueId != null) {
                        result = result
                            .filter(order => order.venueId === args.venueId)
                    }
                    result = result.map(
                        order => ({
                            ...order,
                            venueName: order.venueName.venue,
                        }))
                    return result
                },
            },
        }
        const schema = makeExecutableSchema({
            typeDefs,
            resolvers,
        })

        this.app = express()
        this.app.use('/',
            cors({
                origin: this.frontendURI,
            }),
            graphqlHTTP((req, res) => ({
                schema,
                graphiql: true,
                context: { req, res },
            }))
        )

        this.log.info(`starting backend server on port ${this.port}`)
        await this.app.listen(this.port)
        this.log.info(`server started`)
    }
}
