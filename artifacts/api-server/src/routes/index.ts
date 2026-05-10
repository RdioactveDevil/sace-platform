import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import generateQuestionsRouter from "./generate-questions";
import extractPdfRouter from "./extract-pdf";
import tutorRouter from "./tutor";
import adminRouter from "./admin";
import curriculumRouter from "./curriculum";
import writingRouter from "./writing";
import diagnosticRouter from "./diagnostic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(generateQuestionsRouter);
router.use(extractPdfRouter);
router.use(tutorRouter);
router.use(adminRouter);
router.use(curriculumRouter);
router.use(writingRouter);
router.use(diagnosticRouter);

export default router;
