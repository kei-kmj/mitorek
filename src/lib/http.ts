/** HTTP ステータスコード。ルーターと onError で数値を直書きしない */
export const OK = 200;
export const CREATED = 201;
export const BAD_REQUEST = 400;
export const NOT_FOUND = 404;
/** 楽観ロックの衝突 (updatedAt が古い) や、確認が要る変更 */
export const CONFLICT = 409;
export const INTERNAL_SERVER_ERROR = 500;
