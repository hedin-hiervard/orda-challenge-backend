import fs from 'fs-extra'
import graphqlHTTP from 'express-graphql'
import express from 'express'
import { makeExecutableSchema } from 'graphql-tools'
import _ from 'lodash'
import moment from 'moment'
import cors from 'cors'

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
        start: String!
        desc: String!
    }

    type Query {
        days: [ Day ]
        venueNames: [ Venue ]
        orders(venueId: String): [ Order ]
    }
    type Mutation {
        sendReport(
            email: String!
            dayStart: String!
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

        const resolvers = {
            Mutation: {
                sendReport: (obj, args) => {
                    return {
                        success: true,
                        msg: 'no msg',
                    }
                },
            },
            Query: {
                days: (obj) => {
                    let days = this.data
                        .map(order => moment.unix(order.time).startOf('day'))
                    days = days
                        .map(m => ({
                            start: m.valueOf(),
                            desc: m.format(),
                        }))
                    return days
                },
                venueNames: () => {
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
