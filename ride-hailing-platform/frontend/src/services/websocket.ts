// src/services/websocket.ts
// WebSocket service for real-time communication

type MessageCallback = (data: unknown) => void;

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<MessageCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string = '';
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private baseReconnectDelay: number = 1000;

  /**
   * Connect to WebSocket server
   * @param userId - User ID to identify the connection
   */
  connect(userId: string): void {
    if (this.isConnecting || (this.ws?.readyState === WebSocket.OPEN && this.userId === userId)) {
      return;
    }

    this.userId = userId;
    this.isConnecting = true;

    // Determine WebSocket URL based on environment
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || 'localhost:8080';
    const wsUrl = `${protocol}//${host}/ws?user_id=${encodeURIComponent(userId)}`;

    console.log('Connecting to WebSocket:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Notify listeners about connection
        this.notifyListeners('connected', { userId });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', message.type);
          this.notifyListeners(message.type, message.payload);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error: Event) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.notifyListeners('disconnected', { code: event.code, reason: event.reason });
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.userId) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.notifyListeners('reconnect_failed', { attempts: this.reconnectAttempts });
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect(this.userId);
    }, delay);
  }

  /**
   * Notify all listeners for a specific event type
   */
  private notifyListeners(eventType: string, data: unknown): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket listener:', error);
        }
      });
    }
  }

  /**
   * Subscribe to a specific event type
   * @param eventType - Event type to listen for
   * @param callback - Callback function to handle the event
   */
  on(eventType: string, callback: MessageCallback): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  /**
   * Unsubscribe from a specific event type
   * @param eventType - Event type to stop listening for
   * @param callback - Callback function to remove
   */
  off(eventType: string, callback: MessageCallback): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Send a message through WebSocket
   * @param type - Message type
   * @param payload - Message payload
   */
  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.userId = '';
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

// Export types
export type { MessageCallback, WebSocketMessage };
