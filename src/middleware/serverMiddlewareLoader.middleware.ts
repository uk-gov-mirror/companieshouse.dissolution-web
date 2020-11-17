import { createLoggerMiddleware } from '@companieshouse/structured-logging-node'
import ApplicationLogger from '@companieshouse/structured-logging-node/lib/ApplicationLogger'

import { APP_NAME } from 'app/constants/app.const'
import PiwikConfig from 'app/models/piwikConfig'
import TYPES from 'app/types'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import { Application, NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { ContentSecurityPolicyOptions } from 'helmet/dist/middlewares/content-security-policy'
import { StatusCodes } from 'http-status-codes'
import { inject } from 'inversify'
import { provide } from 'inversify-binding-decorators'
import nocache from 'nocache'
import 'reflect-metadata'
import { v4 as uuidv4 } from 'uuid'
import CustomServerMiddlewareLoader from './customServerMiddlewareLoader.middleware'
import NunjucksLoader from './nunjucksLoader.middleware'

@provide(ServerMiddlewareLoader)
export default class ServerMiddlewareLoader {

  public constructor(
    @inject(TYPES.CDN_HOST) private CDN_HOST: string,
    @inject(TYPES.PIWIK_CONFIG) private PIWIK_CONFIG: PiwikConfig,
    @inject(NunjucksLoader) private nunjucks: NunjucksLoader,
    @inject(ApplicationLogger) private logger: ApplicationLogger,
    @inject(CustomServerMiddlewareLoader) private customServerMiddlewareLoader: CustomServerMiddlewareLoader
  ) {
  }

  public loadServerMiddleware(app: Application, directory: string): void {
    const nonce: string = uuidv4()

    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(cookieParser())
    app.use(createLoggerMiddleware(APP_NAME))
    this.setHeaders(app, nonce)

    this.customServerMiddlewareLoader.loadCustomServerMiddleware(app)

    this.nunjucks.configureNunjucks(app, directory, nonce)
  }

  public configureErrorHandling(app: Application): void {
    app.use((err: any, _: Request, res: Response, _2: NextFunction) => {
      this.logger.error(`${err.constructor.name} - ${err.message}`)

      return res.status(err.status || StatusCodes.INTERNAL_SERVER_ERROR).render('error')
    })
  }

  private static extractPiwikHost(piwikConfig: PiwikConfig): string {
    return new URL(piwikConfig.url).hostname
  }

  private setHeaders(app: Application, nonce: string): void {
    app.use(nocache())
    app.use(
      helmet({
        contentSecurityPolicy: this.prepareCSPConfig(nonce),
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
        }
      })
    )
  }

  private prepareCSPConfig(nonce: string): ContentSecurityPolicyOptions {
    return {
      directives: {
        defaultSrc: [`'self'`],
        scriptSrc: [`'self'`, 'code.jquery.com', this.CDN_HOST, `'nonce-${nonce}'`,
          ServerMiddlewareLoader.extractPiwikHost(this.PIWIK_CONFIG),
          `'sha256-+6WnXIl4mbFTCARd8N3COQmT3bJJmo32N8q8ZSQAIcU='`],
        objectSrc: [`'none'`],
        fontSrc: [`'self'`, this.CDN_HOST],
        styleSrc: [`'self'`, this.CDN_HOST],
        imgSrc: [`'self'`, this.CDN_HOST, ServerMiddlewareLoader.extractPiwikHost(this.PIWIK_CONFIG)]
      }
    }
  }
}
