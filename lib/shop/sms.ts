// SMS-afsendelse til login med telefonnummer. Ingen SMS-udbyder er valgt endnu
// (fx GatewayAPI, CPSMS, Twilio) — indtil da returneres false, og login-ruten
// sender i stedet linket til kundens e-mail, hvis den kendes.

export async function sendSms(_to: string, _text: string): Promise<boolean> {
  return false
}
