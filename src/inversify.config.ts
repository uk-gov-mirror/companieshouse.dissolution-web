import 'reflect-metadata'

import axios, { AxiosInstance } from 'axios'
import { createLogger } from 'ch-logging'
import ApplicationLogger from 'ch-logging/lib/ApplicationLogger'
import { CookieConfig, SessionMiddleware, SessionStore } from 'ch-node-session-handler'
import { Container } from 'inversify'
import { buildProviderModule } from 'inversify-binding-decorators'
import IORedis from 'ioredis'
import { authMiddleware as commonAuthMiddleware } from 'web-security-node'

import { APP_NAME } from 'app/constants/app.const'
import AuthMiddleware from 'app/middleware/auth.middleware'
import CompanyAuthMiddleware from 'app/middleware/companyAuth.middleware'
import AuthConfig from 'app/models/authConfig'
import Optional from 'app/models/optional'
import JwtEncryptionService from 'app/services/encryption/jwtEncryption.service'
import SessionService from 'app/services/session/session.service'
import TYPES from 'app/types'
import { getEnv, getEnvOrDefault, getEnvOrThrow } from 'app/utils/env.util'
import UriFactory from 'app/utils/uri.factory'

export function initContainer(): Container {
  const container: Container = new Container()

  // Env
  container.bind<number>(TYPES.PORT).toConstantValue(Number(getEnvOrDefault('PORT', '3000')))
  container.bind<Optional<string>>(TYPES.NODE_ENV).toConstantValue(getEnv('NODE_ENV'))
  container.bind<string>(TYPES.CDN_HOST).toConstantValue(getEnvOrThrow('CDN_HOST'))
  container.bind<string>(TYPES.CHS_COMPANY_PROFILE_API_LOCAL_URL).toConstantValue(getEnvOrThrow('CHS_COMPANY_PROFILE_API_LOCAL_URL'))
  container.bind<Optional<string>>(TYPES.PIWIK_SITE_ID).toConstantValue(getEnv('PIWIK_SITE_ID'))
  container.bind<Optional<string>>(TYPES.PIWIK_URL).toConstantValue(getEnv('PIWIK_URL'))
  container.bind<Optional<string>>(TYPES.DISSOLUTIONS_API_URL).toConstantValue(getEnvOrThrow('DISSOLUTIONS_API_URL'))

  // Utils
  const logger = createLogger(APP_NAME)
  container.bind<ApplicationLogger>(ApplicationLogger).toConstantValue(logger)
  container.bind<UriFactory>(UriFactory).toConstantValue(new UriFactory())
  container.bind<AxiosInstance>(TYPES.AxiosInstance).toConstantValue(axios.create())

  // Session
  const cookieConfig: CookieConfig = {
    cookieName: getEnvOrThrow('COOKIE_NAME'),
    cookieSecret: getEnvOrThrow('COOKIE_SECRET'),
    cookieDomain: getEnvOrThrow('COOKIE_DOMAIN')
  }
  const sessionStore = new SessionStore(new IORedis(`${getEnvOrThrow('CACHE_SERVER')}`))
  container.bind(SessionStore).toConstantValue(sessionStore)
  container.bind(TYPES.SessionMiddleware).toConstantValue(SessionMiddleware(cookieConfig, sessionStore))

  // Auth
  container.bind(TYPES.AuthMiddleware).toConstantValue(AuthMiddleware(
    getEnvOrThrow('CHS_URL'),
    new UriFactory(),
    commonAuthMiddleware
  ))
  const authConfig: AuthConfig = {
    accountUrl: getEnvOrThrow('ACCOUNT_URL'),
    accountRequestKey: getEnvOrThrow('OAUTH2_REQUEST_KEY'),
    accountClientId: getEnvOrThrow('OAUTH2_CLIENT_ID'),
    chsUrl: getEnvOrThrow('CHS_URL'),
  }
  container.bind(TYPES.CompanyAuthMiddleware).toConstantValue(
    CompanyAuthMiddleware(authConfig, new JwtEncryptionService(authConfig), new SessionService(), logger))

  container.load(buildProviderModule())

  return container
}

export default initContainer

