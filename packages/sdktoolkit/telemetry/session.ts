export class SessionManager {
  private static SESSION_KEY = 'aitour_session_id';
 
  public static getSessionId(): string {
    // Check if the browser already has an active session
    let sessionId = sessionStorage.getItem(this.SESSION_KEY);
   
    if (!sessionId) {
      // Generate a new unique session identifier
      const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).substring(2, 15);
       
      sessionId = `sess_${randomPart}`;
      sessionStorage.setItem(this.SESSION_KEY, sessionId);
    }
   
    return sessionId;
  }
}
 