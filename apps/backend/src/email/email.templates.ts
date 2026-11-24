const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => htmlEntities[character]);

const applicationMessages = {
  en: {
    receivedSubject: 'Application Received',
    receivedTitle: 'We received your instructor application',
    receivedBody:
      'Thank you for applying to become an instructor. We will review your application and email you when a decision is made.',
    approvedSubject: 'Application Approved',
    approvedTitle: 'Your instructor application is approved',
    approvedBody:
      'Congratulations! The instructor role has been granted to your account and you can start creating courses right away.',
    rejectedSubject: 'Application Rejected',
    rejectedTitle: 'Your instructor application was not approved',
    rejectedBody: 'Thank you for your interest in teaching on ScoopDope. Reviewer feedback:',
    rejectedReasonLabel: 'Reason',
    rejectedNoReason: 'No specific reason was provided.',
    greeting: 'Hello',
  },
  es: {
    receivedSubject: 'Solicitud recibida',
    receivedTitle: 'Hemos recibido tu solicitud para ser instructor',
    receivedBody:
      'Gracias por solicitar convertirte en instructor. Revisaremos tu solicitud y te enviaremos un correo cuando tomemos una decisión.',
    approvedSubject: 'Solicitud aprobada',
    approvedTitle: 'Tu solicitud para ser instructor ha sido aprobada',
    approvedBody:
      '¡Enhorabuena! Se ha concedido el rol de instructor a tu cuenta y ya puedes empezar a crear cursos.',
    rejectedSubject: 'Solicitud rechazada',
    rejectedTitle: 'Tu solicitud para ser instructor no ha sido aprobada',
    rejectedBody: 'Gracias por tu interés en enseñar en ScoopDope. Comentarios del revisor:',
    rejectedReasonLabel: 'Motivo',
    rejectedNoReason: 'No se proporcionó un motivo específico.',
    greeting: 'Hola',
  },
  fr: {
    receivedSubject: 'Candidature reçue',
    receivedTitle: 'Nous avons reçu votre candidature pour enseigner',
    receivedBody:
      'Merci d’avoir souhaité devenir formateur. Nous étudierons votre candidature et vous informerons par e-mail de notre décision.',
    approvedSubject: 'Candidature approuvée',
    approvedTitle: 'Votre candidature pour enseigner est approuvée',
    approvedBody:
      'Félicitations ! Le rôle de formateur a été attribué à votre compte et vous pouvez dès maintenant créer des cours.',
    rejectedSubject: 'Candidature rejetée',
    rejectedTitle: 'Votre candidature pour enseigner n’a pas été approuvée',
    rejectedBody:
      'Merci de votre intérêt pour ScoopDope. Commentaire de la personne chargée de l’examen :',
    rejectedReasonLabel: 'Motif',
    rejectedNoReason: 'Aucun motif précis n’a été fourni.',
    greeting: 'Bonjour',
  },
  ar: {
    receivedSubject: 'تم استلام الطلب',
    receivedTitle: 'لقد استلمنا طلبك لتصبح مدرّسًا',
    receivedBody:
      'شكرًا لتقديم طلبك لتصبح مدرّسًا. سنراجع طلبك ونرسل إليك بريدًا إلكترونيًا عند اتخاذ القرار.',
    approvedSubject: 'تمت الموافقة على الطلب',
    approvedTitle: 'تمت الموافقة على طلبك لتصبح مدرّسًا',
    approvedBody:
      'تهانينا! تم منح دور المدرّس لحسابك ويمكنك البدء في إنشاء الدورات على الفور.',
    rejectedSubject: 'تم رفض الطلب',
    rejectedTitle: 'لم تتم الموافقة على طلبك لتصبح مدرّسًا',
    rejectedBody: 'شكرًا لاهتمامك بالتدريس على ScoopDope. ملاحظات المراجع:',
    rejectedReasonLabel: 'السبب',
    rejectedNoReason: 'لم يتم تقديم سبب محدد.',
    greeting: 'مرحبًا',
  },
};

const qaMessages = {
  en: {
    newQuestionSubject: 'New question on your lesson',
    newQuestionTitle: 'A learner asked a question',
    newQuestionBody: 'A new question was posted on your lesson:',
    questionAnsweredSubject: 'Your question was answered',
    questionAnsweredTitle: 'Your question has an answer',
    questionAnsweredBody: 'An instructor answered your question:',
    questionLabel: 'Question',
    answerLabel: 'Answer',
    lessonLabel: 'Lesson',
    greeting: 'Hello',
  },
  es: {
    newQuestionSubject: 'Nueva pregunta en tu lección',
    newQuestionTitle: 'Un estudiante ha hecho una pregunta',
    newQuestionBody: 'Se ha publicado una nueva pregunta en tu lección:',
    questionAnsweredSubject: 'Tu pregunta ha sido respondida',
    questionAnsweredTitle: 'Tu pregunta tiene respuesta',
    questionAnsweredBody: 'Un instructor ha respondido a tu pregunta:',
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    lessonLabel: 'Lección',
    greeting: 'Hola',
  },
  fr: {
    newQuestionSubject: 'Nouvelle question sur votre leçon',
    newQuestionTitle: 'Un apprenant a posé une question',
    newQuestionBody: 'Une nouvelle question a été publiée sur votre leçon :',
    questionAnsweredSubject: 'Votre question a reçu une réponse',
    questionAnsweredTitle: 'Votre question a une réponse',
    questionAnsweredBody: 'Un formateur a répondu à votre question :',
    questionLabel: 'Question',
    answerLabel: 'Réponse',
    lessonLabel: 'Leçon',
    greeting: 'Bonjour',
  },
  ar: {
    newQuestionSubject: 'سؤال جديد في درسك',
    newQuestionTitle: 'طرح أحد المتعلمين سؤالًا',
    newQuestionBody: 'تم نشر سؤال جديد في درسك:',
    questionAnsweredSubject: 'تمت الإجابة على سؤالك',
    questionAnsweredTitle: 'سؤالك لديه إجابة',
    questionAnsweredBody: 'أجاب مدرّس على سؤالك:',
    questionLabel: 'السؤال',
    answerLabel: 'الإجابة',
    lessonLabel: 'الدرس',
    greeting: 'مرحبًا',
  },
};

const moderationMessages = {
  en: {
    submittedSubject: 'Course submitted for review',
    submittedTitle: 'A course is awaiting moderation',
    submittedBody: 'An instructor submitted a course for review:',
    approvedSubject: 'Course approved',
    approvedTitle: 'Your course has been approved',
    approvedBody: 'Your course has been reviewed and published:',
    rejectedSubject: 'Course rejected',
    rejectedTitle: 'Your course was not approved',
    rejectedBody: 'Your course was reviewed and rejected:',
    courseLabel: 'Course',
    instructorLabel: 'Instructor',
    notesLabel: 'Reviewer notes',
    greeting: 'Hello',
  },
  es: {
    submittedSubject: 'Curso enviado para revisión',
    submittedTitle: 'Un curso está pendiente de moderación',
    submittedBody: 'Un instructor ha enviado un curso para revisión:',
    approvedSubject: 'Curso aprobado',
    approvedTitle: 'Tu curso ha sido aprobado',
    approvedBody: 'Tu curso ha sido revisado y publicado:',
    rejectedSubject: 'Curso rechazado',
    rejectedTitle: 'Tu curso no ha sido aprobado',
    rejectedBody: 'Tu curso ha sido revisado y rechazado:',
    courseLabel: 'Curso',
    instructorLabel: 'Instructor',
    notesLabel: 'Comentarios del revisor',
    greeting: 'Hola',
  },
  fr: {
    submittedSubject: 'Cours soumis à examen',
    submittedTitle: 'Un cours est en attente de modération',
    submittedBody: 'Un formateur a soumis un cours à examen :',
    approvedSubject: 'Cours approuvé',
    approvedTitle: 'Votre cours a été approuvé',
    approvedBody: 'Votre cours a été examiné et publié :',
    rejectedSubject: 'Cours rejeté',
    rejectedTitle: 'Votre cours n’a pas été approuvé',
    rejectedBody: 'Votre cours a été examiné et rejeté :',
    courseLabel: 'Cours',
    instructorLabel: 'Formateur',
    notesLabel: 'Commentaire de la personne chargée de l’examen',
    greeting: 'Bonjour',
  },
  ar: {
    submittedSubject: 'تم إرسال الدورة للمراجعة',
    submittedTitle: 'دورة بانتظار المراجعة',
    submittedBody: 'أرسل مدرّس دورة للمراجعة:',
    approvedSubject: 'تمت الموافقة على الدورة',
    approvedTitle: 'تمت الموافقة على دورتك',
    approvedBody: 'تمت مراجعة دورتك ونشرها:',
    rejectedSubject: 'تم رفض الدورة',
    rejectedTitle: 'لم تتم الموافقة على دورتك',
    rejectedBody: 'تمت مراجعة دورتك ورفضها:',
    courseLabel: 'الدورة',
    instructorLabel: 'المدرّس',
    notesLabel: 'ملاحظات المراجع',
    greeting: 'مرحبًا',
  },
};

const waitlistMessages = {
  en: {
    subject: "You're on the waitlist!",
    title: "You're on the waitlist!",
    body: 'Thanks for signing up. We will email you as soon as a spot opens up.',
    positionLabel: 'Your position in the queue',
    timeline: 'Estimated invitation timeline: we are inviting new members in batches over the coming weeks.',
    greeting: 'Hello',
  },
  es: {
    subject: '¡Estás en la lista de espera!',
    title: '¡Estás en la lista de espera!',
    body: 'Gracias por registrarte. Te enviaremos un correo en cuanto se libere una plaza.',
    positionLabel: 'Tu posición en la cola',
    timeline:
      'Plazo estimado de invitación: estamos invitando a nuevos miembros por lotes durante las próximas semanas.',
    greeting: 'Hola',
  },
  fr: {
    subject: 'Vous êtes sur la liste d’attente !',
    title: 'Vous êtes sur la liste d’attente !',
    body: 'Merci de votre inscription. Nous vous enverrons un e-mail dès qu’une place se libère.',
    positionLabel: 'Votre position dans la file',
    timeline:
      'Délai d’invitation estimé : nous invitons les nouveaux membres par lots au cours des prochaines semaines.',
    greeting: 'Bonjour',
  },
  ar: {
    subject: 'أنت على قائمة الانتظار!',
    title: 'أنت على قائمة الانتظار!',
    body: 'شكرًا لتسجيلك. سنرسل إليك بريدًا إلكترونيًا بمجرد توفر مكان.',
    positionLabel: 'موقعك في قائمة الانتظار',
    timeline: 'الموعد المتوقع للدعوة: ندعو الأعضاء الجدد على دفعات خلال الأسابيع القادمة.',
    greeting: 'مرحبًا',
  },
};

type ApplicationLocale = keyof typeof applicationMessages;
type WaitlistLocale = keyof typeof waitlistMessages;
type QaLocale = keyof typeof qaMessages;
type ModerationLocale = keyof typeof moderationMessages;

const isRtlLocale = (locale?: string) => (locale || 'en').split('-')[0].toLowerCase() === 'ar';

/**
 * Returns the attributes for the root <html> element plus RTL-safe CSS.
 * Arabic locales get dir="rtl" lang="ar"; everything else stays LTR.
 * Layout uses logical properties (padding-inline, margin-inline, text-align:start)
 * so padding/margins mirror automatically without overflowing the 600px container.
 */
const rtlSupport = (locale?: string) => {
  const rtl = isRtlLocale(locale);
  const lang = (locale || 'en').split('-')[0].toLowerCase();
  const htmlAttributes = `dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}"`;
  const css = rtl
    ? `<style>
        html[dir="rtl"] body { direction: rtl; text-align: right; }
        html[dir="rtl"] .email-container { direction: rtl; text-align: right; padding-inline: 16px; }
        html[dir="rtl"] blockquote { border-inline-start: 4px solid #ddd; border-inline-end: none; padding-inline-start: 12px; padding-inline-end: 0; margin-inline-start: 0; margin-inline-end: 0; }
        html[dir="rtl"] ul { padding-inline-start: 20px; padding-inline-end: 0; }
      </style>`
    : '';
  return { rtl, lang, htmlAttributes, css };
};

const wrapEmail = (locale: string | undefined, innerHtml: string) => {
  const { htmlAttributes, css } = rtlSupport(locale);
  return `<!DOCTYPE html>
<html ${htmlAttributes}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${css}
  </head>
  <body style="margin:0;padding:0">
    <div class="email-container" style="font-family:sans-serif;max-width:600px;margin:0 auto;padding-inline:16px;box-sizing:border-box;text-align:start">
      ${innerHtml}
    </div>
  </body>
</html>`;
};

const applicationTemplate = (
  kind: 'received' | 'approved' | 'rejected',
  data: { userName: string; locale?: string; adminNote?: string | null; rejectionReason?: string | null }
) => {
  const locale = (data.locale || 'en').split('-')[0] as ApplicationLocale;
  const messages = applicationMessages[locale] || applicationMessages.en;
  const title = messages[`${kind}Title`];
  const body = messages[`${kind}Body`];
  const reason = (data.rejectionReason ?? data.adminNote ?? '').trim();
  const reviewerFeedback =
    kind === 'rejected'
      ? `<p><strong>${messages.rejectedReasonLabel}:</strong></p>
      <blockquote>${escapeHtml(reason || messages.rejectedNoReason)}</blockquote>`
      : '';

  const inner = `
      <h2>${title}</h2>
      <p>${messages.greeting} ${escapeHtml(data.userName)},</p>
      <p>${body}</p>
      ${reviewerFeedback}`;

  return {
    subject: messages[`${kind}Subject`],
    html: wrapEmail(locale, inner),
  };
};

const qaTemplate = (
  kind: 'newQuestion' | 'questionAnswered',
  data: {
    userName: string;
    question: string;
    lessonTitle?: string | null;
    answer?: string | null;
    locale?: string;
  }
) => {
  const locale = (data.locale || 'en').split('-')[0] as QaLocale;
  const messages = qaMessages[locale] || qaMessages.en;
  const title = messages[`${kind}Title`];
  const body = messages[`${kind}Body`];
  const lessonLine = data.lessonTitle
    ? `<p><strong>${messages.lessonLabel}:</strong> ${escapeHtml(data.lessonTitle)}</p>`
    : '';
  const answerBlock =
    kind === 'questionAnswered' && data.answer
      ? `<p><strong>${messages.answerLabel}:</strong></p><blockquote>${escapeHtml(data.answer)}</blockquote>`
      : '';

  const inner = `
      <h2>${title}</h2>
      <p>${messages.greeting} ${escapeHtml(data.userName)},</p>
      <p>${body}</p>
      ${lessonLine}
      <p><strong>${messages.questionLabel}:</strong></p>
      <blockquote>${escapeHtml(data.question)}</blockquote>
      ${answerBlock}`;

  return {
    subject: messages[`${kind}Subject`],
    html: wrapEmail(locale, inner),
  };
};

const moderationTemplate = (
  kind: 'submitted' | 'approved' | 'rejected',
  data: {
    userName: string;
    courseTitle: string;
    instructorName?: string | null;
    notes?: string | null;
    locale?: string;
  }
) => {
  const locale = (data.locale || 'en').split('-')[0] as ModerationLocale;
  const messages = moderationMessages[locale] || moderationMessages.en;
  const title = messages[`${kind}Title`];
  const body = messages[`${kind}Body`];
  const instructorLine =
    kind === 'submitted' && data.instructorName
      ? `<p><strong>${messages.instructorLabel}:</strong> ${escapeHtml(data.instructorName)}</p>`
      : '';
  const notesBlock =
    kind === 'rejected' && data.notes
      ? `<p><strong>${messages.notesLabel}:</strong></p><blockquote>${escapeHtml(data.notes)}</blockquote>`
      : '';

  const inner = `
      <h2>${title}</h2>
      <p>${messages.greeting} ${escapeHtml(data.userName)},</p>
      <p>${body}</p>
      <p><strong>${messages.courseLabel}:</strong> ${escapeHtml(data.courseTitle)}</p>
      ${instructorLine}
      ${notesBlock}`;

  return {
    subject: messages[`${kind}Subject`],
    html: wrapEmail(locale, inner),
  };
};

export const emailTemplates = {
  applicationReceived: (data: { userName: string; locale?: string }) =>
    applicationTemplate('received', data),

  applicationApproved: (data: { userName: string; locale?: string }) =>
    applicationTemplate('approved', data),

  applicationRejected: (data: {
    userName: string;
    locale?: string;
    adminNote?: string | null;
    rejectionReason?: string | null;
  }) => applicationTemplate('rejected', data),

  newQuestion: (data: {
    userName: string;
    question: string;
    lessonTitle?: string | null;
    locale?: string;
  }) => qaTemplate('newQuestion', data),

  questionAnswered: (data: {
    userName: string;
    question: string;
    answer?: string | null;
    lessonTitle?: string | null;
    locale?: string;
  }) => qaTemplate('questionAnswered', data),

  courseSubmittedForReview: (data: {
    userName: string;
    courseTitle: string;
    instructorName?: string | null;
    locale?: string;
  }) => moderationTemplate('submitted', data),

  courseApproved: (data: {
    userName: string;
    courseTitle: string;
    notes?: string | null;
    locale?: string;
  }) => moderationTemplate('approved', data),

  courseRejected: (data: {
    userName: string;
    courseTitle: string;
    notes?: string | null;
    locale?: string;
  }) => moderationTemplate('rejected', data),

  enrollment: (data: { userName: string; courseTitle: string; courseUrl: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>Welcome to ${data.courseTitle}!</h2>
        <p>Hi ${data.userName},</p>
        <p>You've successfully enrolled. Start learning now:</p>
        <a href="${data.courseUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Go to Course</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );

    return {
      subject: `You're enrolled in "${data.courseTitle}"`,
      html,
      text: htmlToPlainText(html),
    };
  },

  completion: (data: { userName: string; courseTitle: string; credentialUrl: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>🎉 Course Completed!</h2>
        <p>Hi ${data.userName},</p>
        <p>You've completed <strong>${data.courseTitle}</strong>. Your credential is ready:</p>
        <a href="${data.credentialUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Credential</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );
    
    return {
      subject: `Congratulations! You completed "${data.courseTitle}"`,
      html,
      text: htmlToPlainText(html),
    };
  },

  credentialIssued: (data: { userName: string; courseTitle: string; txHash: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>🏆 Credential Issued on Stellar</h2>
        <p>Hi ${data.userName},</p>
        <p>Your credential for <strong>${data.courseTitle}</strong> has been recorded on the Stellar blockchain.</p>
        <p>Transaction: <code>${data.txHash}</code></p>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );
    
    return {
      subject: `Your blockchain credential for "${data.courseTitle}" is ready`,
      html,
      text: htmlToPlainText(html),
    };
  },

  moduleUnlocked: (data: { userName: string; courseTitle: string; moduleTitle: string; courseUrl: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>🔓 New Module Available</h2>
        <p>Hi ${data.userName},</p>
        <p>A new module has just unlocked in <strong>${data.courseTitle}</strong>:</p>
        <p style="font-size:18px;font-weight:bold">${data.moduleTitle}</p>
        <a href="${data.courseUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Start Learning</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );
    
    return {
      subject: `New content unlocked in "${data.courseTitle}"`,
      html,
      text: htmlToPlainText(html),
    };
  },

  liveSessionReminder: (data: { userName: string; sessionTitle: string; date: string; timeLabel: string; joinUrl: string; sessionUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>⏰ Session starting in ${data.timeLabel}</h2>
        <p>Hi ${data.userName},</p>
        <p><strong>${data.sessionTitle}</strong> starts in ${data.timeLabel}.</p>
        <ul>
          <li><strong>Date:</strong> ${data.date}</li>
          ${data.joinUrl ? `<li><strong>Join:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a></li>` : ''}
        </ul>
        <a href="${data.joinUrl || data.sessionUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Join Now</a>`
    );
    
    return {
      subject: `⏰ Reminder: "${data.sessionTitle}" starts in ${data.timeLabel}`,
      html,
      text: htmlToPlainText(html),
    };
  },

  batchEnrollmentComplete: (data: { userName: string; jobId: string; total: number; processed: number; failed: number; statusUrl: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>✅ Batch Enrollment Complete</h2>
        <p>Hi ${data.userName},</p>
        <p>Your batch enrollment job <code>${data.jobId}</code> has finished processing.</p>
        <ul>
          <li><strong>Total enrollments:</strong> ${data.total}</li>
          <li><strong>Processed:</strong> ${data.processed}</li>
          <li><strong>Failed:</strong> ${data.failed}</li>
        </ul>
        <a href="${data.statusUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Results</a>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );

    return {
      subject: `Batch enrollment job ${data.jobId} completed`,
      html,
      text: htmlToPlainText(html),
    };
  },

  dataExportReady: (data: { userName: string; downloadUrl: string; expiresAt: string; unsubscribeUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>📦 Your Data Export is Ready</h2>
        <p>Hi ${data.userName},</p>
        <p>Your personal data export is ready to download. The ZIP archive contains separate JSON files for each data category.</p>
        <a href="${data.downloadUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Download Export</a>
        <p>This download link expires on <strong>${data.expiresAt}</strong> (48 hours after it was generated).</p>
        <p style="margin-top:40px;font-size:12px;color:#999">
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>`
    );

    return {
      subject: 'Your data export is ready',
      html,
      text: htmlToPlainText(html),
    };
  },

  calendarInvite: (data: { userName: string; sessionTitle: string; date: string; duration: number; joinUrl?: string; sessionUrl: string; locale?: string }): EmailTemplate => {
    const html = wrapEmail(
      data.locale,
      `
        <h2>📅 You're invited to a live session</h2>
        <p>Hi ${data.userName},</p>
        <p><strong>${data.sessionTitle}</strong> has been scheduled.</p>
        <ul>
          <li><strong>Date:</strong> ${data.date}</li>
          <li><strong>Duration:</strong> ${data.duration} minutes</li>
          ${data.joinUrl ? `<li><strong>Join:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a></li>` : ''}
        </ul>
        <p>Add to your calendar using the attached .ics file.</p>
        <a href="${data.sessionUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Session</a>`
    );
    
    return {
      subject: `📅 Live Session: ${data.sessionTitle}`,
      html,
      text: htmlToPlainText(html),
    };
  },
};
