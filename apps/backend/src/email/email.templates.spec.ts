import { emailTemplates } from './email.templates';

describe('instructor application email templates', () => {
  it.each([
    [
      'en',
      'We received your instructor application',
      'Your instructor application is approved',
      'Your instructor application was not approved',
    ],
    [
      'es',
      'Hemos recibido tu solicitud para ser instructor',
      'Tu solicitud para ser instructor ha sido aprobada',
      'Tu solicitud para ser instructor no ha sido aprobada',
    ],
    [
      'fr',
      'Nous avons reçu votre candidature pour enseigner',
      'Votre candidature pour enseigner est approuvée',
      'Votre candidature pour enseigner n’a pas été approuvée',
    ],
    [
      'ar',
      'لقد استلمنا طلبك لتصبح مدرّسًا',
      'تمت الموافقة على طلبك لتصبح مدرّسًا',
      'لم تتم الموافقة على طلبك لتصبح مدرّسًا',
    ],
  ])('renders all three templates in %s', (locale, receivedText, approvedText, rejectedText) => {
    const received = emailTemplates.applicationReceived({ userName: 'Ari', locale });
    const approved = emailTemplates.applicationApproved({ userName: 'Ari', locale });
    const rejected = emailTemplates.applicationRejected({
      userName: 'Ari',
      locale,
      adminNote: '<please revise>',
    });

    expect(received.html).toContain(receivedText);
    expect(approved.html).toContain(approvedText);
    expect(rejected.html).toContain(rejectedText);
    expect(rejected.html).toContain('&lt;please revise&gt;');
    expect(rejected.html).not.toContain('<please revise>');
    expect(received.subject).toBeTruthy();
    expect(approved.subject).toBeTruthy();
    expect(rejected.subject).toBeTruthy();
    expect(received.html).toContain(locale === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
  });
});
