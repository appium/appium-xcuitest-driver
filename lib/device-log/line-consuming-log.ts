import {IOSLog} from './ios-log';
import { toLogEntry } from './helpers';
import type { LogEntry } from '../commands/types';

type TSerializedEntry = [string, number];

export abstract class LineConsumingLog extends IOSLog<string, TSerializedEntry> {
  protected override _serializeEntry(value: string): TSerializedEntry {
    return [value, Date.now()];
  }

  protected override _deserializeEntry(value: TSerializedEntry): LogEntry {
    const [message, timestamp] = value;
    return toLogEntry(message, timestamp);
  }
}
