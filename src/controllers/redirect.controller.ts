import { inject } from 'inversify'
import { controller, httpGet } from 'inversify-express-utils'
import { RedirectResult } from 'inversify-express-utils/dts/results'
import moment from 'moment'

import BaseController from 'app/controllers/base.controller'
import ApplicationStatus from 'app/models/dto/applicationStatus.enum'
import DissolutionGetDirector from 'app/models/dto/dissolutionGetDirector'
import DissolutionGetResponse from 'app/models/dto/dissolutionGetResponse'
import DissolutionApprovalModel from 'app/models/form/dissolutionApproval.model'
import Optional from 'app/models/optional'
import DissolutionSession from 'app/models/session/dissolutionSession.model'
import { ENDORSE_COMPANY_CLOSURE_CERTIFICATE_URI, REDIRECT_GATE_URI, ROOT_URI, SELECT_DIRECTOR_URI } from 'app/paths'
import DissolutionService from 'app/services/dissolution/dissolution.service'
import SessionService from 'app/services/session/session.service'
import TYPES from 'app/types'

@controller(REDIRECT_GATE_URI, TYPES.SessionMiddleware, TYPES.AuthMiddleware, TYPES.CompanyAuthMiddleware)
export class RedirectController extends BaseController {

  public constructor(@inject(SessionService) private session: SessionService,
                     @inject(DissolutionService) private service: DissolutionService) {
    super()
  }

  @httpGet('')
  public async get(): Promise<RedirectResult> {
    const dissolutionSession: DissolutionSession = this.session.getDissolutionSession(this.httpContext.request)!
    const token: string = this.session.getAccessToken(this.httpContext.request)
    const dissolution: Optional<DissolutionGetResponse> = await this.service.getDissolution(token, dissolutionSession)

    if (!dissolution) {
      return this.redirect(SELECT_DIRECTOR_URI)
    }

    const signingDirector: Optional<DissolutionGetDirector> = this.getUserPendingSignature(dissolution!)

    if (dissolution!.application_status === ApplicationStatus.PENDING_APPROVAL && signingDirector) {

      dissolutionSession.approval = this.prepareApprovalData(dissolution!, signingDirector)
      this.session.setDissolutionSession(this.httpContext.request, dissolutionSession)

      return this.redirect(ENDORSE_COMPANY_CLOSURE_CERTIFICATE_URI)
    }

    return this.redirect(ROOT_URI + '/')
  }

  private getUserPendingSignature(dissolution: DissolutionGetResponse): Optional<DissolutionGetDirector> {
    const userEmail: string = this.session.getUserEmail(this.httpContext.request)

    return dissolution.directors.find(director => director.email === userEmail && !director.approved_at)
  }

  private prepareApprovalData(dissolution: DissolutionGetResponse, signingDirector: DissolutionGetDirector): DissolutionApprovalModel {
    return {
      companyName: dissolution.company_name,
      companyNumber: dissolution.company_number,
      applicant: signingDirector.name,
      date: moment().format('DD MMMM YYYY')
    }
  }
}