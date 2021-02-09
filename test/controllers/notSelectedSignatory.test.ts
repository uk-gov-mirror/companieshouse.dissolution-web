import 'reflect-metadata'

import { assert } from 'chai'
import { Application } from 'express'
import { StatusCodes } from 'http-status-codes'
import request from 'supertest'
import { anything, instance, mock, when } from 'ts-mockito'
import { createApp } from './helpers/application.factory'
import HtmlAssertHelper from './helpers/htmlAssert.helper'

import 'app/controllers/notSelectedSignatory.controller'
import ViewApplicationStatusMapper from 'app/mappers/view-application-status/viewApplicationStatus.mapper'
import DissolutionGetResponse from 'app/models/dto/dissolutionGetResponse'
import DissolutionSession from 'app/models/session/dissolutionSession.model'
import { ViewApplicationStatus } from 'app/models/view/viewApplicationStatus.model'
import { NOT_SELECTED_SIGNATORY } from 'app/paths'
import DissolutionService from 'app/services/dissolution/dissolution.service'
import SessionService from 'app/services/session/session.service'

import { generateDissolutionGetResponse } from 'test/fixtures/dissolutionApi.fixtures'
import { generateDissolutionSession, TOKEN } from 'test/fixtures/session.fixtures'
import {
  generateViewApplicationStatusModel,
  generateViewApplicationStatusSignatory
} from 'test/fixtures/viewApplicationStatus.fixtures'

let session: SessionService
let dissolutionService: DissolutionService
let viewApplicationStatusMapper: ViewApplicationStatusMapper

const COMPANY_NUMBER = '01777777'

let app: Application

let dissolutionSession: DissolutionSession
let dissolution: DissolutionGetResponse
let viewApplicationStatus: ViewApplicationStatus

beforeEach(() => {
  session = mock(SessionService)
  dissolutionService = mock(DissolutionService)
  viewApplicationStatusMapper = mock(ViewApplicationStatusMapper)

  dissolutionSession = generateDissolutionSession(COMPANY_NUMBER)
  dissolution = generateDissolutionGetResponse()
  viewApplicationStatus = generateViewApplicationStatusModel()

  when(session.getAccessToken(anything())).thenReturn(TOKEN)
  when(session.getDissolutionSession(anything())).thenReturn(dissolutionSession)
  when(dissolutionService.getDissolution(TOKEN, dissolutionSession)).thenResolve(dissolution)
  when(viewApplicationStatusMapper.mapToViewModel(dissolutionSession, dissolution, false)).thenReturn(viewApplicationStatus)

  app = createApp(container => {
    container.rebind(SessionService).toConstantValue(instance(session))
    container.rebind(DissolutionService).toConstantValue(instance(dissolutionService))
    container.rebind(ViewApplicationStatusMapper).toConstantValue(instance(viewApplicationStatusMapper))
  })
})

describe('NotSelectedSignatoryController', () => {
  describe('GET request', () => {
    it('should render the NotSelectedSignatory page', async () => {

      const res = await request(app)
        .get(NOT_SELECTED_SIGNATORY)
        .expect(StatusCodes.OK)

      const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

      assert.isTrue(htmlAssertHelper.hasText('h1', 'Email address not authorised to sign'))
    })
  })

  describe('View Application Status', () => {
    it('should display each signatory on a separate row', async () => {
      viewApplicationStatus.signatories = [
        generateViewApplicationStatusSignatory(),
        generateViewApplicationStatusSignatory(),
      ]

      const res = await request(app)
        .get(NOT_SELECTED_SIGNATORY)
        .expect(StatusCodes.OK)

      const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

      assert.isTrue(htmlAssertHelper.selectorExists('#name-0'))
      assert.isTrue(htmlAssertHelper.selectorExists('#name-1'))
      assert.isTrue(htmlAssertHelper.selectorDoesNotExist('#name-2'))
    })

    it('should display the signatory info correctly', async () => {
      viewApplicationStatus.signatories = [
        { ...generateViewApplicationStatusSignatory(), name: 'Jane Smith', email: 'jane@mail.com' },
        { ...generateViewApplicationStatusSignatory(), name: 'John Doe', email: 'john@mail.com' }
      ]

      const res = await request(app)
        .get(NOT_SELECTED_SIGNATORY)
        .expect(StatusCodes.OK)

      const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

      assert.isTrue(htmlAssertHelper.hasText('#name-0', 'Jane Smith'))
      assert.isTrue(htmlAssertHelper.hasText('#email-0', 'jane@mail.com'))

      assert.isTrue(htmlAssertHelper.hasText('#name-1', 'John Doe'))
      assert.isTrue(htmlAssertHelper.hasText('#email-1', 'john@mail.com'))
    })

    it('should display the correct signed status for each signatory', async () => {
      viewApplicationStatus.signatories = [
        { ...generateViewApplicationStatusSignatory(), hasApproved: true },
        { ...generateViewApplicationStatusSignatory(), hasApproved: false }
      ]

      const res = await request(app)
        .get(NOT_SELECTED_SIGNATORY)
        .expect(StatusCodes.OK)

      const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

      assert.isTrue(htmlAssertHelper.hasText('#signed-0 .govuk-tag', 'Signed'))
      assert.isTrue(htmlAssertHelper.hasText('#signed-1 .govuk-tag', 'Not signed'))
    })

    describe('change', () => {
      it('should not display the change column', async () => {
        viewApplicationStatus.showChangeColumn = false

        const res = await request(app)
          .get(NOT_SELECTED_SIGNATORY)
          .expect(StatusCodes.OK)

        const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

        assert.isFalse(htmlAssertHelper.selectorExists('#change-col'))
      })

      it('should not display the change link beside each editable signatory', async () => {
        viewApplicationStatus.showChangeColumn = false
        viewApplicationStatus.signatories = [
          { ...generateViewApplicationStatusSignatory(), canChange: false, id: 'abc123' },
          { ...generateViewApplicationStatusSignatory(), canChange: false }
        ]

        const res = await request(app)
          .get(NOT_SELECTED_SIGNATORY)
          .expect(StatusCodes.OK)

        const htmlAssertHelper: HtmlAssertHelper = new HtmlAssertHelper(res.text)

        assert.isFalse(htmlAssertHelper.selectorExists('#change-0'))
      })
    })
  })
})
