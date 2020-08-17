import { inject } from 'inversify'
import { controller, httpGet, queryParam } from 'inversify-express-utils'
import { RedirectResult } from 'inversify-express-utils/dts/results'

import BaseController from 'app/controllers/base.controller'
import DissolutionApprovalMapper from 'app/mappers/approval/dissolutionApproval.mapper'
import ApplicationStatus from 'app/models/dto/applicationStatus.enum'
import DissolutionGetDirector from 'app/models/dto/dissolutionGetDirector'
import DissolutionGetResponse from 'app/models/dto/dissolutionGetResponse'
import PaymentStatus from 'app/models/dto/paymentStatus.enum'
import Optional from 'app/models/optional'
import DissolutionSession from 'app/models/session/dissolutionSession.model'
import {
  CERTIFICATE_SIGNED_URI,
  ENDORSE_COMPANY_CLOSURE_CERTIFICATE_URI,
  PAYMENT_URI,
  REDIRECT_GATE_URI,
  SEARCH_COMPANY_URI, SELECT_DIRECTOR_URI,
  VIEW_FINAL_CONFIRMATION_URI,
  WAIT_FOR_OTHERS_TO_SIGN_URI,
  NOT_SELECTED_SIGNATORY
} from 'app/paths'
import DissolutionService from 'app/services/dissolution/dissolution.service'
import SessionService from 'app/services/session/session.service'
import TYPES from 'app/types'

@controller(REDIRECT_GATE_URI, TYPES.SessionMiddleware, TYPES.AuthMiddleware, TYPES.CompanyAuthMiddleware)
export class RedirectController extends BaseController {

  public constructor(
    @inject(SessionService) private session: SessionService,
    @inject(DissolutionService) private service: DissolutionService,
    @inject(DissolutionApprovalMapper) private mapper: DissolutionApprovalMapper) {
    super()
  }

  @httpGet('')
  public async get(): Promise<RedirectResult> {
    const session: DissolutionSession = this.session.getDissolutionSession(this.httpContext.request)!
    const dissolution: Optional<DissolutionGetResponse> = await this.getDissolution(session)

    if (!dissolution) {
      return this.redirect(SELECT_DIRECTOR_URI)
    }

    session.applicationReferenceNumber = dissolution.application_reference

    switch (dissolution.application_status) {
      case ApplicationStatus.PAID:
        return this.saveSessionAndRedirect(session, VIEW_FINAL_CONFIRMATION_URI)
      case ApplicationStatus.PENDING_PAYMENT:
        return this.handlePendingPaymentRedirect(dissolution, session)
      case ApplicationStatus.PENDING_APPROVAL:
        return this.handlePendingApprovalRedirect(dissolution, session)
      default:
        return Promise.reject('Unexpected application status received')
    }
  }

  @httpGet('/payment-callback')
  public async getPaymentCallback(
    @queryParam('state') state: string,
    @queryParam('status') status: PaymentStatus,
    @queryParam('ref') reference: string): Promise<RedirectResult> {
    const session: DissolutionSession = this.session.getDissolutionSession(this.httpContext.request)!

    if (session.paymentStateUUID !== state) {
      return Promise.reject('State value is invalid')
    }

    session.applicationReferenceNumber = reference

    return this.saveSessionAndRedirect(session, this.getPaymentCallbackRedirectUri(status))
  }

  private async getDissolution(session: DissolutionSession): Promise<Optional<DissolutionGetResponse>> {
    const token: string = this.session.getAccessToken(this.httpContext.request)
    return this.service.getDissolution(token, session)
  }

  private async handlePendingPaymentRedirect(dissolution: DissolutionGetResponse, session: DissolutionSession): Promise<RedirectResult> {
    const userEmail: string = this.session.getUserEmail(this.httpContext.request)
    const redirectUri: string = this.getPendingPaymentRedirectUri(dissolution, userEmail)

    private getPendingPaymentRedirectUri(dissolution: DissolutionGetResponse, userEmail: string): string {
      if (this.isApplicant(dissolution, userEmail)) {
        return PAYMENT_URI
      } else if (this.getSignatory(dissolution, userEmail)) {
        return CERTIFICATE_SIGNED_URI
      } else {
        return NOT_SELECTED_SIGNATORY
      }

    return this.saveSessionAndRedirect(session, redirectUri)
  }

  private async handlePendingApprovalRedirect(dissolution: DissolutionGetResponse, session: DissolutionSession): Promise<RedirectResult> {
    const userEmail: string = this.session.getUserEmail(this.httpContext.request)

    const signatory: Optional<DissolutionGetDirector> = this.getSignatory(dissolution, userEmail)

    if (signatory) {
      if (signatory.approved_at) {
          return this.saveSessionAndRedirect(session, CERTIFICATE_SIGNED_URI)
      }

      session.approval = this.mapper.mapToApprovalModel(dissolution!, signatory)
      return this.saveSessionAndRedirect(session, ENDORSE_COMPANY_CLOSURE_CERTIFICATE_URI)
      }

    if (this.isApplicant(dissolution, userEmail)) {
      return this.saveSessionAndRedirect(session, WAIT_FOR_OTHERS_TO_SIGN_URI)
      }

    return this.saveSessionAndRedirect(session, NOT_SELECTED_SIGNATORY)
  }

  private getSignatory(dissolution: DissolutionGetResponse, userEmail: string): Optional<DissolutionGetDirector> {
    return dissolution.directors.find(director => director.email === userEmail)
  }

  private isApplicant(dissolution: DissolutionGetResponse, userEmail: string): boolean {
    return dissolution!.created_by === userEmail
  }

  private saveSessionAndRedirect(session: DissolutionSession, redirectUri: string): RedirectResult {
    this.session.setDissolutionSession(this.httpContext.request, session)
    return this.redirect(redirectUri)
  }

  private getPaymentCallbackRedirectUri(status: PaymentStatus): string {
    switch (status) {
      case PaymentStatus.PAID:
        return VIEW_FINAL_CONFIRMATION_URI
      case PaymentStatus.CANCELLED:
        return SEARCH_COMPANY_URI
      case PaymentStatus.FAILED:
        return PAYMENT_URI
      default:
        throw new Error('Unexpected payment status received')
    }
  }
}
