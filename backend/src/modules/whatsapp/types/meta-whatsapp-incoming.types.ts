export type MetaIncomingMessageData = {
  messagingProduct: string | null;
  displayPhoneNumber: string | null;
  phoneNumberId: string | null;
  customerWaId: string | null;
  customerName: string | null;
  messageId: string | null;
  from: string | null;
  timestamp: string | null;
  type: string | null;
  textBody: string | null;
  rawInstance?: string | null;
};

export type MetaIncomingStatusData = {
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  messageId: string | null;
  status: string | null;
  timestamp: string | null;
  recipientId: string | null;
  rawInstance?: string | null;
};

export type MetaIncomingUnknownData = {
  rawObject: string | null;
  hasEntry: boolean;
  changeField: string | null;
};

export type MetaIncomingParsed =
  | { kind: 'message'; data: MetaIncomingMessageData }
  | { kind: 'status'; data: MetaIncomingStatusData }
  | { kind: 'unknown'; data: MetaIncomingUnknownData };
