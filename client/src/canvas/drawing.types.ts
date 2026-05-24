export interface Point {
  x: number;
  y: number;
}

export interface DrawData {
  roomId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  color: string;
  lineWidth: number;
}
