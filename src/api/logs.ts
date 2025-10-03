import { Request, Response } from 'express';
import chalk from 'chalk';

enum MessageType {
  Output = 0,
  Info = 1,
  Warning = 2,
  Error = 3
}

interface Log {
  message: string;
  messageType: MessageType;
}

export function createLogsHandler() {
  return async (req: Request, res: Response) => {
    const log: Log = req.body;

    switch (log.messageType) {
      case MessageType.Output:
      case MessageType.Info:
        console.log('Output:', log.message);
        break;
      case MessageType.Warning:
        console.log('Warning:', chalk.yellow(log.message));
        break;
      case MessageType.Error:
        console.log('Error:', chalk.red(log.message));
        break;
    }

    res.status(200).send();
  };
}