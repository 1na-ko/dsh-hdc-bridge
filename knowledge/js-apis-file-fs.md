> **节选说明 / Excerpt note**：本文件为官方文档节选（CC-BY-4.0）：仅保留以下小节，未修改任何文字。原文：https://gitee.com/openharmony/docs/raw/b84779874332bd7c2afee0ca3875494fa4793f1f/zh-cn/application-dev/reference/apis-core-file-kit/js-apis-file-fs.md

## 导入模块

```ts
import { fileIo } from '@kit.CoreFileKit';
```

## 使用说明

使用该功能模块对文件/目录进行操作前，需要先获取其应用沙箱路径，获取方式及其接口用法请参考：

  ```ts
  import { UIAbility } from '@kit.AbilityKit';
  import { window } from '@kit.ArkUI';

  export default class EntryAbility extends UIAbility {
    onWindowStageCreate(windowStage: window.WindowStage) {
      let context = this.context;
      let pathDir = context.filesDir;
    }
  }
  ```

获取沙箱路径的方式及其接口用法也可参考：[应用上下文Context-获取应用文件路径](../../application-models/application-context-stage.md#获取应用文件路径)。<br/>将指向资源的字符串称为URI。对于只支持沙箱路径作为入参的接口，可以使用构造fileUri对象并获取其沙箱路径的属性的方式将URI转换为沙箱路径，然后使用文件接口。URI定义解及其转换方式请参考：[文件URI](../../../application-dev/reference/apis-core-file-kit/js-apis-file-fileuri.md)。

## fileIo.stat

stat(file: string | number): Promise&lt;Stat&gt;

获取文件或目录详细属性信息，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| file   | string \| number | 是   | 文件或目录的应用沙箱路径path、URI或已打开的文件描述符fd。<br>**说明**：从API version 22开始，支持传入URI。 |

**返回值：**

  | 类型                           | 说明         |
  | ---------------------------- | ---------- |
  | Promise&lt;[Stat](#stat)&gt; | Promise对象。返回文件或目录的具体信息。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.stat(filePath).then((stat: fileIo.Stat) => {
    console.info(`Succeeded in getting file info, the size of file is ${stat.size}`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to get file info. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.stat

stat(file: string | number, callback: AsyncCallback&lt;Stat&gt;): void

获取文件或目录的详细属性信息，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                               | 必填 | 说明                           |
| -------- | ---------------------------------- | ---- | ------------------------------ |
| file     | string \| number                   | 是   | 文件或目录的应用沙箱路径path、URI或已打开的文件描述符fd。<br>**说明**：从API version 22开始，支持传入URI。 |
| callback | AsyncCallback&lt;[Stat](#stat)&gt; | 是   | 异步获取文件或目录的信息之后的回调。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  fileIo.stat(pathDir, (err: BusinessError, stat: fileIo.Stat) => {
    if (err) {
      console.error(`Failed to get file info. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in getting file info, the size of file is ${stat.size}`);
    }
  });
  ```

## fileIo.statSync

statSync(file: string | number): Stat

以同步方法获取文件或目录详细属性信息。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| file   | string \| number | 是   | 文件或目录的应用沙箱路径path、URI或已打开的文件描述符fd。<br>**说明**：从API version 22开始，支持传入URI。 |

**返回值：**

  | 类型            | 说明         |
  | ------------- | ---------- |
  | [Stat](#stat) | 表示文件或目录的具体信息。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let stat = fileIo.statSync(pathDir);
  console.info(`Succeeded in getting file info, the size of file is ${stat.size}`);
  ```

## fileIo.access

access(path: string, mode?: AccessModeType): Promise&lt;boolean&gt;

检查文件或目录是否存在，或校验操作权限，使用promise异步回调。<br>校验读、写或读写权限不通过会抛出13900012（Permission denied）错误码。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 文件或目录应用沙箱路径。                                   |
| mode<sup>12+</sup>   | [AccessModeType](#accessmodetype12) | 否   | 文件或目录校验的权限。不填该参数则默认校验文件是否存在。|

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;boolean&gt; | Promise对象。返回布尔值。返回true，表示文件存在；返回false，表示文件不存在。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。


**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.access(filePath).then((res: boolean) => {
    if (res) {
      console.info(`Succeeded in checking file, file exists.`);
    } else {
      console.info(`Succeeded in checking file, file does not exist.`);
    }
  }).catch((err: BusinessError) => {
    console.error(`Failed to access. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.access<sup>12+</sup>

access(path: string, mode: AccessModeType, flag: AccessFlagType): Promise&lt;boolean&gt;

检查文件或目录是否在本地，或校验操作权限，使用promise异步回调。<br>校验读、写或读写权限不通过会抛出13900012（Permission denied）错误码。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path | string | 是   | 文件或目录应用沙箱路径。                                   |
| mode | [AccessModeType](#accessmodetype12) | 是   | 文件或目录校验的权限。|
| flag | [AccessFlagType](#accessflagtype12) | 是| 文件或目录校验的位置。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;boolean&gt; | Promise对象。返回布尔值。返回true，表示文件或目录在本地且校验权限存在；返回false，表示文件或目录不存在或者文件或目录在云端或其他分布式设备上。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)和[通用错误码](../errorcode-universal.md)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.access(filePath, fileIo.AccessModeType.EXIST, fileIo.AccessFlagType.LOCAL).then((res: boolean) => {
    if (res) {
      console.info(`Succeeded in checking file, file exists.`);
    } else {
      console.info(`Succeeded in checking file, file does not exist.`);
    }
  }).catch((err: BusinessError) => {
    console.error(`Failed to access. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.access

access(path: string, callback: AsyncCallback&lt;boolean&gt;): void

检查文件或目录是否存在，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| path     | string                    | 是   | 文件或目录应用沙箱路径。                                   |
| callback | AsyncCallback&lt;boolean&gt; | 是   | 异步检查文件或目录是否存在的回调。如果存在，回调返回true；否则返回false。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。


**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.access(filePath, (err: BusinessError, res: boolean) => {
    if (err) {
      console.error(`Failed to access. Code: ${err.code}, message: ${err.message}`);
    } else {
      if (res) {
        console.info(`Succeeded in checking file, file exists.`);
      } else {
        console.info(`Succeeded in checking file, file does not exist.`);
      }
    }
  });
  ```

## fileIo.accessSync

accessSync(path: string, mode?: AccessModeType): boolean

以同步方法检查文件或目录是否存在，或校验操作权限。<br>校验读、写或读写权限不通过会抛出13900012（Permission denied）错误码。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 文件或目录应用沙箱路径。                                   |
| mode<sup>12+</sup>   | [AccessModeType](#accessmodetype12) | 否   | 文件或目录校验的权限。不填该参数则默认校验文件或目录是否存在。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | boolean | 返回true，表示文件存在；返回false，表示文件不存在。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  try {
    let res = fileIo.accessSync(filePath);
    if (res) {
      console.info(`Succeeded in checking file, file exists.`);
    } else {
      console.info(`Succeeded in checking file, file does not exist.`);
    }
  } catch(error) {
    let err: BusinessError = error as BusinessError;
    console.error(`Failed to accessSync. Code: ${err.code}, message: ${err.message}`);
  }
  ```

## fileIo.accessSync<sup>12+</sup>

accessSync(path: string, mode: AccessModeType, flag: AccessFlagType): boolean

以同步方法检查文件或目录是否在本地，或校验操作权限。<br>校验读、写或读写权限不通过会抛出13900012（Permission denied）错误码。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path  | string | 是   | 文件应用沙箱路径。                                   |
| mode | [AccessModeType](#accessmodetype12) | 是   | 文件或目录校验的权限。|
| flag | [AccessFlagType](#accessflagtype12) | 是   | 文件或目录校验的位置。|

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | boolean | 返回true，表示文件在本地且校验权限存在；返回false，表示文件不存在或者文件在云端或其他分布式设备上。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)和[通用错误码](../errorcode-universal.md)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  try {
    let res = fileIo.accessSync(filePath, fileIo.AccessModeType.EXIST, fileIo.AccessFlagType.LOCAL);
    if (res) {
      console.info(`Succeeded in checking file, file exists.`);
    } else {
      console.info(`Succeeded in checking file, file does not exist.`);
    }
  } catch(error) {
    let err: BusinessError = error as BusinessError;
    console.error(`Failed to accessSync. Code: ${err.code}, message: ${err.message}`);
  }
  ```

## fileIo.close

close(file: number | File): Promise&lt;void&gt;

关闭文件或目录，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型     | 必填   | 说明           |
  | ---- | ------ | ---- | ------------ |
  | file   | number \| [File](#file) | 是    | 已打开的File对象或已打开的文件描述符fd。关闭后file对象或文件描述符fd不再具备实际意义，不可再用于进行读写等操作。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.close(file).then(() => {
    console.info(`Succeeded in closing file.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to close file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.close

close(file: number | File, callback: AsyncCallback&lt;void&gt;): void

关闭文件或目录，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                        | 必填   | 说明           |
  | -------- | ------------------------- | ---- | ------------ |
  | file       | number \| [File](#file)        | 是    | 已打开的File对象或已打开的文件描述符fd。关闭后file对象或文件描述符fd不再具备实际意义，不可再用于进行读写等操作。 |
  | callback | AsyncCallback&lt;void&gt; | 是    | 异步关闭文件或目录之后的回调。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.close(file, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to close file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in closing file.`);
    }
  });
  ```

## fileIo.closeSync

closeSync(file: number | File): void

以同步方法关闭文件或目录。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型     | 必填   | 说明           |
  | ---- | ------ | ---- | ------------ |
  | file   | number \| [File](#file) | 是    | 已打开的File对象或已打开的文件描述符fd。关闭后file对象或文件描述符fd不再具备实际意义，不可再用于进行读写等操作。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.closeSync(file);
  ```

## fileIo.copy<sup>11+</sup>

copy(srcUri: string, destUri: string, options?: CopyOptions): Promise\<void>

拷贝文件或目录，使用promise异步回调。

支持跨设备拷贝。强制覆盖拷贝。入参支持文件或目录URI。<br/>
跨端拷贝时，最多同时存在10个拷贝任务；单次拷贝的文件数量不得超过500个。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型                         | 必填   | 说明                                       |
  | ---- | -------------------------- | ---- | ---------------------------------------- |
  | srcUri  | string | 是    | 待复制文件或目录的URI。                      |
  | destUri | string | 是    | 目标文件或目录的URI。                          |
  | options | [CopyOptions](#copyoptions11)| 否| options中提供拷贝进度回调。不填该参数则无拷贝进度回调。|

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise\<void> | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)和[通用错误码](../errorcode-universal.md)。

**示例：**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import { fileUri } from '@kit.CoreFileKit';

let srcDirPathLocal: string = pathDir + "/src";
let dstDirPathLocal: string = pathDir + "/dest";

let srcDirUriLocal: string = fileUri.getUriFromPath(srcDirPathLocal);
let dstDirUriLocal: string = fileUri.getUriFromPath(dstDirPathLocal);

let progressListener: fileIo.ProgressListener = (progress: fileIo.Progress) => {
  console.info(`progressSize: ${progress.processedSize}, totalSize: ${progress.totalSize}`);
};
let copyOption: fileIo.CopyOptions = {
  "progressListener" : progressListener
}
try {
  fileIo.copy(srcDirUriLocal, dstDirUriLocal, copyOption).then(()=>{
    console.info("Succeeded in copying.");
  }).catch((err: BusinessError)=>{
    console.error(`Failed to copy. Code: ${err.code}, message: ${err.message}`);
  })
} catch(err) {
  console.error(`Failed to copy.Code: ${err.code}, message: ${err.message}`);
}
```

## fileIo.copy<sup>11+</sup>

copy(srcUri: string, destUri: string, callback: AsyncCallback\<void>): void

拷贝文件或者目录，使用callback异步回调。

支持跨设备拷贝。强制覆盖拷贝。入参支持文件或目录URI。<br/>
跨端拷贝时，最多同时存在10个拷贝任务；单次拷贝的文件数量不得超过500个。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型    | 必填   | 说明          |
  | ---- | ------------------ | ---- | ----------------------------|
  | srcUri  | string | 是    | 待复制文件或目录的URI。                      |
  | destUri | string | 是    | 目标文件或目录的URI。                          |
  | callback | AsyncCallback\<void>| 是| 异步拷贝之后的回调。|

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)和[通用错误码](../errorcode-universal.md)。

**示例：**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import { fileUri } from '@kit.CoreFileKit';

let srcDirPathLocal: string = pathDir + "/src";
let dstDirPathLocal: string = pathDir + "/dest";

let srcDirUriLocal: string = fileUri.getUriFromPath(srcDirPathLocal);
let dstDirUriLocal: string = fileUri.getUriFromPath(dstDirPathLocal);

try {
  fileIo.copy(srcDirUriLocal, dstDirUriLocal, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to copy. Code: ${err.code}, message: ${err.message}`);
      return;
    }
    console.info("Succeeded in copying.");
  })
} catch(err) {
  console.error(`Failed to copy. Code: ${err.code}, message: ${err.message}`);
}
```

## fileIo.copy<sup>11+</sup>

copy(srcUri: string, destUri: string, options: CopyOptions, callback: AsyncCallback\<void>): void

拷贝文件或者目录，使用callback异步回调。

支持跨设备拷贝。强制覆盖拷贝。入参支持文件或目录URI。<br/>
跨端拷贝时，最多同时存在10个拷贝任务；单次拷贝的文件数量不得超过500个。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型                         | 必填   | 说明                                       |
  | ---- | -------------------------- | ---- | ---------------------------------------- |
  | srcUri  | string | 是    | 待复制文件或目录的URI。                      |
  | destUri | string | 是    | 目标文件或目录的URI。                          |
  | options | [CopyOptions](#copyoptions11) |是| 拷贝进度回调。                          |
  | callback | AsyncCallback\<void>| 是| 异步拷贝之后的回调。|

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)和[通用错误码](../errorcode-universal.md)。

**示例：**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import { fileUri } from '@kit.CoreFileKit';

let srcDirPathLocal: string = pathDir + "/src";
let dstDirPathLocal: string = pathDir + "/dest";

let srcDirUriLocal: string = fileUri.getUriFromPath(srcDirPathLocal);
let dstDirUriLocal: string = fileUri.getUriFromPath(dstDirPathLocal);

try {
  let progressListener: fileIo.ProgressListener = (progress: fileIo.Progress) => {
    console.info(`progressSize: ${progress.processedSize}, totalSize: ${progress.totalSize}`);
  };
  let copyOption: fileIo.CopyOptions = {
    "progressListener" : progressListener
  }
  fileIo.copy(srcDirUriLocal, dstDirUriLocal, copyOption, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to copy. Code: ${err.code}, message: ${err.message}`);
      return;
    }
    console.info("Succeeded in copying.");
  })
} catch(err) {
  console.error(`Failed to copy. Code: ${err.code}, message: ${err.message}`);
}
```

## fileIo.copyFile

copyFile(src: string | number, dest: string | number, mode?: number): Promise&lt;void&gt;

复制文件，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型                         | 必填   | 说明                                       |
  | ---- | -------------------------- | ---- | ---------------------------------------- |
  | src  | string \| number | 是    | 待复制文件的路径或待复制文件的文件描述符。                      |
  | dest | string \| number | 是    | 目标文件路径或目标文件的文件描述符。                          |
  | mode | number                     | 否    | mode提供覆盖文件的选项，当前仅支持0，且默认为0。<br/>0：完全覆盖目标文件，未覆盖部分将被裁切掉。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/srcDir/test.txt";
  let dstPath = pathDir + "/dstDir/test.txt";
  fileIo.copyFile(srcPath, dstPath, 0).then(() => {
    console.info(`Succeeded in copying file.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to copy file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.copyFile

copyFile(src: string | number, dest: string | number, mode: number, callback: AsyncCallback&lt;void&gt;): void

复制文件，可设置覆盖文件的方式，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                         | 必填   | 说明                                       |
  | -------- | -------------------------- | ---- | ---------------------------------------- |
  | src      | string \| number | 是    | 待复制文件的路径或待复制文件的文件描述符。                      |
  | dest     | string \| number | 是    | 目标文件路径或目标文件的文件描述符。                          |
  | mode     | number                     | 是    | mode提供覆盖文件的选项，当前仅支持0，且默认为0。<br/>0：完全覆盖目标文件，未覆盖部分将被裁切掉。 |
  | callback | AsyncCallback&lt;void&gt;  | 是    | 异步复制文件之后的回调。                             |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/srcDir/test.txt";
  let dstPath = pathDir + "/dstDir/test.txt";
  fileIo.copyFile(srcPath, dstPath, 0, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to copy file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in copying file.`);
    }
  });
  ```

## fileIo.copyFile

copyFile(src: string | number, dest: string | number, callback: AsyncCallback&lt;void&gt;): void

复制文件，覆盖方式为完全覆盖目标文件，未覆盖部分将被裁切。使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                         | 必填   | 说明                                       |
  | -------- | -------------------------- | ---- | ---------------------------------------- |
  | src      | string \| number | 是    | 待复制文件的路径或待复制文件的文件描述符。                      |
  | dest     | string \| number | 是    | 目标文件路径或目标文件的文件描述符。                          |
  | callback | AsyncCallback&lt;void&gt;  | 是    | 异步复制文件之后的回调。                             |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/srcDir/test.txt";
  let dstPath = pathDir + "/dstDir/test.txt";
  fileIo.copyFile(srcPath, dstPath, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to copy file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in copying file.`);
    }
  });
  ```


## fileIo.copyFileSync

copyFileSync(src: string | number, dest: string | number, mode?: number): void

以同步方法复制文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型                         | 必填   | 说明                                       |
  | ---- | -------------------------- | ---- | ---------------------------------------- |
  | src  | string \| number | 是    | 待复制文件的路径或待复制文件的文件描述符。                      |
  | dest | string \| number | 是    | 目标文件路径或目标文件的文件描述符。                          |
  | mode | number                     | 否    | mode提供覆盖文件的选项，当前仅支持0，且默认为0。<br/>0：完全覆盖目标文件，未覆盖部分将被裁切掉。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let srcPath = pathDir + "/srcDir/test.txt";
  let dstPath = pathDir + "/dstDir/test.txt";
  fileIo.copyFileSync(srcPath, dstPath);
  ```

## fileIo.copyDir<sup>10+</sup>

copyDir(src: string, dest: string, mode?: number): Promise\<void>

复制源目录至目标路径下，使用promise异步回调。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源目录的应用沙箱路径。 |
  | dest | string | 是    | 目标目录的应用沙箱路径。 |
  | mode | number | 否    | 复制模式，默认值为0。<br/>-&nbsp; mode为0，文件级别抛异常。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则抛出异常。源目录下未冲突的文件全部移动至目标目录下，目标目录下未冲突文件将继续保留，且冲突文件信息将在抛出异常的data属性中以Array\<[ConflictFiles](#conflictfiles10)>形式提供。<br/>-&nbsp; mode为1，文件级别强制覆盖。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则强制覆盖冲突目录下所有同名文件，未冲突文件将继续保留。|

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  // copy directory from srcPath to destPath
  let srcPath = pathDir + "/srcDir/";
  let destPath = pathDir + "/destDir/";
  fileIo.copyDir(srcPath, destPath, 0).then(() => {
    console.info(`Succeeded in copying directory.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to copy directory. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.copyDir<sup>10+</sup>

copyDir(src: string, dest: string, mode: number, callback: AsyncCallback\<void, Array\<ConflictFiles>>): void

复制源目录至目标路径下，可设置复制模式。使用callback异步回调。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源目录的应用沙箱路径。 |
  | dest | string | 是    | 目标目录的应用沙箱路径。 |
  | mode | number | 是    | 复制模式，默认值为0。<br/>-&nbsp; mode为0，文件级别抛异常。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则抛出异常。源目录下未冲突的文件全部移动至目标目录下，目标目录下未冲突文件将继续保留，且冲突文件信息将在抛出异常的data属性中以Array\<[ConflictFiles](#conflictfiles10)>形式提供。<br/>-&nbsp; mode为1，文件级别强制覆盖。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则强制覆盖冲突目录下所有同名文件，未冲突文件将继续保留。|
  | callback | AsyncCallback&lt;void, Array&lt;[ConflictFiles](#conflictfiles10)&gt;&gt; | 是    | 异步复制目录之后的回调。              |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { ConflictFiles } from '@kit.CoreFileKit';

  // copy directory from srcPath to destPath
  let srcPath = pathDir + "/srcDir/";
  let destPath = pathDir + "/destDir/";
  fileIo.copyDir(srcPath, destPath, 0, (err: BusinessError<Array<ConflictFiles>>) => {
    if (err && err.code == 13900015 && err.data?.length !== undefined) {
      for (let i = 0; i < err.data.length; i++) {
        console.error(`Failed to copy directory, with conflicting files: ${err.data[i].srcFile} ${err.data[i].destFile}`);
      }
    } else if (err) {
      console.error(`Failed to copy directory. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in copying directory.`);
    }
  });
  ```

## fileIo.copyDir<sup>10+</sup>

copyDir(src: string, dest: string, callback: AsyncCallback\<void, Array\<ConflictFiles>>): void

复制源目录至目标路径下，使用callback异步回调。

如果目标目录下有与源目录名冲突的目录，且冲突目录下有同名文件，则抛出异常。源目录下未冲突的文件全部移动至目标目录下，目标目录下未冲突文件将继续保留，且冲突文件信息将在抛出异常的data属性中以Array\<[ConflictFiles](#conflictfiles10)>形式提供。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源目录的应用沙箱路径。 |
  | dest | string | 是    | 目标目录的应用沙箱路径。 |
  | callback | AsyncCallback&lt;void, Array&lt;[ConflictFiles](#conflictfiles10)&gt;&gt; | 是    | 异步复制目录之后的回调。              |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { ConflictFiles } from '@kit.CoreFileKit';

  // copy directory from srcPath to destPath
  let srcPath = pathDir + "/srcDir/";
  let destPath = pathDir + "/destDir/";
  fileIo.copyDir(srcPath, destPath, (err: BusinessError<Array<ConflictFiles>>) => {
    if (err && err.code == 13900015 && err.data?.length !== undefined) {
      for (let i = 0; i < err.data.length; i++) {
        console.error(`Failed to copy directory, with conflicting files: ${err.data[i].srcFile} ${err.data[i].destFile}`);
      }
    } else if (err) {
      console.error(`Failed to copy directory. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in copying directory.`);
    }
  });
  ```

## fileIo.copyDirSync<sup>10+</sup>

copyDirSync(src: string, dest: string, mode?: number): void

以同步方法复制源目录至目标路径下。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源目录的应用沙箱路径。 |
  | dest | string | 是    | 目标目录的应用沙箱路径。 |
  | mode | number | 否    | 复制模式，默认值为0。<br/>-&nbsp; mode为0，文件级别抛异常。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则抛出异常。源目录下未冲突的文件全部移动至目标目录下，目标目录下未冲突文件将继续保留，且冲突文件信息将在抛出异常的data属性中以Array\<[ConflictFiles](#conflictfiles10)>形式提供。<br/>-&nbsp; mode为1，文件级别强制覆盖。目标目录下存在与源目录名冲突的目录，若冲突目录下存在同名文件，则强制覆盖冲突目录下所有同名文件，未冲突文件将继续保留。|

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  // copy directory from srcPath to destPath
  let srcPath = pathDir + "/srcDir/";
  let destPath = pathDir + "/destDir/";
  try {
    fileIo.copyDirSync(srcPath, destPath, 0);
    console.info(`Succeeded in copying directory.`);
  } catch (error) {
    let err: BusinessError = error as BusinessError;
    console.error(`Failed to copy directory. Code: ${err.code}, message: ${err.message}`);
  }
  ```

## fileIo.mkdir

mkdir(path: string): Promise&lt;void&gt;

创建目录，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 目录的应用沙箱路径。                                   |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir";
  fileIo.mkdir(dirPath).then(() => {
    console.info(`Succeeded in making directory.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to make directory. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.mkdir<sup>11+</sup>

mkdir(path: string, recursion: boolean): Promise\<void>

创建目录，使用promise异步回调。当recursion指定为true时，可递归创建目录。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 目录的应用沙箱路径。                                   |
| recursion   | boolean | 是   | 是否递归创建目录。recursion指定为true时，可递归创建目录。recursion指定为false时，仅可创建单层目录。   |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir1/testDir2/testDir3";
  fileIo.mkdir(dirPath, true).then(() => {
    console.info(`Succeeded in making directory.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to make directory. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.mkdir

mkdir(path: string, callback: AsyncCallback&lt;void&gt;): void

创建目录，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| path     | string                    | 是   | 目录的应用沙箱路径。                                   |
| callback | AsyncCallback&lt;void&gt; | 是   | 异步创建目录操作完成之后的回调。                             |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir";
  fileIo.mkdir(dirPath, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to make directory. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in making directory.`);
    }
  });
  ```

## fileIo.mkdir<sup>11+</sup>

mkdir(path: string, recursion: boolean, callback: AsyncCallback&lt;void&gt;): void

创建目录，使用callback异步回调。当recursion指定为true，可递归创建目录。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                                                         |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| path     | string                    | 是   | 目录的应用沙箱路径。                                   |
| recursion   | boolean | 是   | 是否递归创建目录。recursion指定为true时，可递归创建目录。recursion指定为false时，仅可创建单层目录。   |
| callback | AsyncCallback&lt;void&gt; | 是   | 异步创建目录操作完成之后的回调。                             |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir1/testDir2/testDir3";
  fileIo.mkdir(dirPath, true, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to make directory. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in making directory.`);
    }
  });
  ```

## fileIo.mkdirSync

mkdirSync(path: string): void

以同步方法创建目录。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 目录的应用沙箱路径。                                   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let dirPath = pathDir + "/testDir";
  fileIo.mkdirSync(dirPath);
  ```

## fileIo.mkdirSync<sup>11+</sup>

mkdirSync(path: string, recursion: boolean): void

以同步方法创建目录。当recursion指定为true，可递归创建目录。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 目录的应用沙箱路径。                                   |
| recursion   | boolean | 是   | 是否递归创建目录。recursion指定为true时，可递归创建目录。recursion指定为false时，仅可创建单层目录。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let dirPath = pathDir + "/testDir1/testDir2/testDir3";
  fileIo.mkdirSync(dirPath, true);
  ```

## fileIo.open

open(path: string, mode?: number): Promise&lt;File&gt;

打开文件或目录，使用promise异步回调。支持使用URI打开文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 文件或目录的应用沙箱路径或文件URI。                                   |
| mode  | number | 否   | 打开文件或目录的[选项](#openmode)，必须指定如下选项中的一个，默认以只读方式打开：<br/>-&nbsp;OpenMode.READ_ONLY(0o0)：只读打开。<br/>-&nbsp;OpenMode.WRITE_ONLY(0o1)：只写打开。<br/>-&nbsp;OpenMode.READ_WRITE(0o2)：读写打开。<br/>可以追加以下功能选项，以按位或的方式组合，默认情况下不追加任何额外选项。<br/>-&nbsp;OpenMode.CREATE(0o100)：如果文件不存在，则创建文件。<br/>-&nbsp;OpenMode.TRUNC(0o1000)：如果文件存在且文件具有写权限，则将其长度裁剪为零。<br/>-&nbsp;OpenMode.APPEND(0o2000)：以追加方式打开，后续写将追加到文件末尾。<br/>-&nbsp;OpenMode.NONBLOCK(0o4000)：如果path指向FIFO、块特殊文件或字符特殊文件，则本次打开及后续&nbsp;IO&nbsp;进行非阻塞操作。<br/>-&nbsp;OpenMode.DIR(0o200000)：如果path不指向目录，则出错。不允许附加写权限。<br/>-&nbsp;OpenMode.NOFOLLOW(0o400000)：如果path指向符号链接，则出错。<br/>-&nbsp;OpenMode.SYNC(0o4010000)：以同步IO方式打开文件。<br/>- OpenMode.UNCACHE(0o10000000000)：读写文件不进行页缓存。 |

**返回值：**

  | 类型                    | 说明          |
  | --------------------- | ----------- |
  | Promise&lt;[File](#file)&gt; | Promise对象。返回File对象。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.open(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE).then((file: fileIo.File) => {
    console.info(`Succeeded in getting file fd: ${file.fd}`);
    fileIo.closeSync(file);
  }).catch((err: BusinessError) => {
    console.error(`Failed to open file. Code: ${err.code}, message: ${err.message}`);
  });
  ```


## fileIo.open

open(path: string, mode: number, callback: AsyncCallback&lt;File&gt;): void

打开文件或目录，可设置打开文件的选项。使用callback异步回调。

支持使用URI打开文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                            | 必填 | 说明                                                         |
| -------- | ------------------------------- | ---- | ------------------------------------------------------------ |
| path     | string                          | 是   | 文件或目录的应用沙箱路径或URI。                                   |
| mode  | number | 是   | 打开文件或目录的[选项](#openmode)，必须指定如下选项中的一个，默认以只读方式打开：<br/>-&nbsp;OpenMode.READ_ONLY(0o0)：只读打开。<br/>-&nbsp;OpenMode.WRITE_ONLY(0o1)：只写打开。<br/>-&nbsp;OpenMode.READ_WRITE(0o2)：读写打开。<br/>给定如下功能选项，以按位或的方式追加，默认不给定任何额外选项：<br/>-&nbsp;OpenMode.CREATE(0o100)：若文件不存在，则创建文件。<br/>-&nbsp;OpenMode.TRUNC(0o1000)：如果文件存在且文件具有写权限，则将其长度裁剪为零。<br/>-&nbsp;OpenMode.APPEND(0o2000)：以追加方式打开，后续写将追加到文件末尾。<br/>-&nbsp;OpenMode.NONBLOCK(0o4000)：如果path指向FIFO、块特殊文件或字符特殊文件，则本次打开及后续&nbsp;IO&nbsp;进行非阻塞操作。<br/>-&nbsp;OpenMode.DIR(0o200000)：如果path不指向目录，则出错。不允许附加写权限。<br/>-&nbsp;OpenMode.NOFOLLOW(0o400000)：如果path指向符号链接，则出错。<br/>-&nbsp;OpenMode.SYNC(0o4010000)：以同步IO的方式打开文件。<br/>- OpenMode.UNCACHE(0o10000000000)：读写文件不进行页缓存。|
| callback     | AsyncCallback&lt;[File](#file)&gt;                          | 是   | 异步打开文件之后的回调。                                   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.open(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE, (err: BusinessError, file: fileIo.File) => {
    if (err) {
      console.error(`Failed to open. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in getting file fd: ${file.fd}`);
      fileIo.closeSync(file);
    }
  });
  ```

## fileIo.open

open(path: string, callback: AsyncCallback&lt;File&gt;): void

打开文件或目录，使用callback异步回调。支持使用URI打开文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                            | 必填 | 说明                                                         |
| -------- | ------------------------------- | ---- | ------------------------------------------------------------ |
| path     | string                          | 是   | 文件或目录的应用沙箱路径或URI。                                   |
| callback     | AsyncCallback&lt;[File](#file)&gt;                          | 是   | 异步打开文件之后的回调。                                   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.open(filePath, (err: BusinessError, file: fileIo.File) => {
    if (err) {
      console.error(`Failed to open. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in getting file fd: ${file.fd}`);
      fileIo.closeSync(file);
    }
  });
  ```

## fileIo.openSync

openSync(path: string, mode?: number): File

以同步方法打开文件或目录。支持使用URI打开文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                                                         |
| ------ | ------ | ---- | ------------------------------------------------------------ |
| path   | string | 是   | 打开文件或目录的应用沙箱路径或URI。                                   |
| mode  | number | 否   | 打开文件或目录的[选项](#openmode)，必须指定如下选项中的一个，默认以只读方式打开：<br/>-&nbsp;OpenMode.READ_ONLY(0o0)：只读打开。<br/>-&nbsp;OpenMode.WRITE_ONLY(0o1)：只写打开。<br/>-&nbsp;OpenMode.READ_WRITE(0o2)：读写打开。<br/>给定如下功能选项，以按位或的方式追加，默认不给定任何额外选项：<br/>-&nbsp;OpenMode.CREATE(0o100)：若文件不存在，则创建文件。<br/>-&nbsp;OpenMode.TRUNC(0o1000)：如果文件存在且文件具有写权限，则将其长度裁剪为零。<br/>-&nbsp;OpenMode.APPEND(0o2000)：以追加方式打开，后续写将追加到文件末尾。<br/>-&nbsp;OpenMode.NONBLOCK(0o4000)：如果path指向FIFO、块特殊文件或字符特殊文件，则本次打开及后续&nbsp;IO&nbsp;进行非阻塞操作。<br/>-&nbsp;OpenMode.DIR(0o200000)：如果path不指向目录，则出错。不允许附加写权限。<br/>-&nbsp;OpenMode.NOFOLLOW(0o400000)：如果path指向符号链接，则出错。<br/>-&nbsp;OpenMode.SYNC(0o4010000)：以同步IO的方式打开文件。<br/>- OpenMode.UNCACHE(0o10000000000)：读写文件不进行页缓存。 |

**返回值：**

  | 类型     | 说明          |
  | ------ | ----------- |
  | [File](#file) | 打开的File对象。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE);
  console.info(`Succeeded in getting file fd: ${file.fd}`);
  fileIo.closeSync(file);
  ```

## fileIo.read

read(fd: number, buffer: ArrayBuffer, options?: ReadOptions): Promise&lt;number&gt;

读取文件数据，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名  | 类型        | 必填 | 说明                                                         |
| ------- | ----------- | ---- | ------------------------------------------------------------ |
| fd      | number      | 是   | 已打开的文件描述符。                                     |
| buffer  | ArrayBuffer | 是   | 用于保存读取到的文件数据的缓冲区。                           |
| options | [ReadOptions](#readoptions11)      | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读。<br/>-&nbsp;length，number类型，表示期望读取数据的长度，单位为Byte。可选，默认缓冲区长度。|

**返回值：**

  | 类型                                 | 说明     |
  | ---------------------------------- | ------ |
  | Promise&lt;number&gt; | Promise对象。返回实际读取的数据长度，单位为Byte。|

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { buffer } from '@kit.ArkTS';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE);
  let arrayBuffer = new ArrayBuffer(4096);
  fileIo.read(file.fd, arrayBuffer).then((readLen: number) => {
    let buf = buffer.from(arrayBuffer, 0, readLen);
    console.info(`Succeeded in reading file data. The content of file: ${buf.toString()}`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to read file data. Code: ${err.code}, message: ${err.message}`);
  }).finally(() => {
    fileIo.closeSync(file);
  });
  ```

## fileIo.read

read(fd: number, buffer: ArrayBuffer, options?: ReadOptions, callback: AsyncCallback&lt;number&gt;): void

从文件读取数据，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                                       | 必填   | 说明                                       |
  | -------- | ---------------------------------------- | ---- | ---------------------------------------- |
  | fd       | number                                   | 是    | 已打开的文件描述符。                             |
  | buffer   | ArrayBuffer                              | 是    | 用于保存读取到的文件数据的缓冲区。                        |
  | options | [ReadOptions](#readoptions11)      | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读。<br/>-&nbsp;length，number类型，表示期望读取数据的长度，单位为Byte。可选，默认缓冲区长度。|
  | callback | AsyncCallback&lt;number&gt; | 是    | 异步读取数据之后的回调。返回实际读取的数据长度，单位为Byte。                             |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { buffer } from '@kit.ArkTS';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE);
  let arrayBuffer = new ArrayBuffer(4096);
  fileIo.read(file.fd, arrayBuffer, (err: BusinessError, readLen: number) => {
    if (err) {
      console.error(`Failed to read. Code: ${err.code}, message: ${err.message}`);
    } else {
      let buf = buffer.from(arrayBuffer, 0, readLen);
      console.info(`Succeeded in reading file data. The content of file: ${buf.toString()}`);
    }
    fileIo.closeSync(file);
  });
  ```

## fileIo.readSync

readSync(fd: number, buffer: ArrayBuffer, options?: ReadOptions): number

以同步方法从文件读取数据。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名     | 类型          | 必填   | 说明                                       |
  | ------- | ----------- | ---- | ---------------------------------------- |
  | fd      | number      | 是    | 已打开的文件描述符。                             |
  | buffer  | ArrayBuffer | 是    | 用于保存读取到的文件数据的缓冲区。                        |
  | options | [ReadOptions](#readoptions11)      | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读。<br/>-&nbsp;length，number类型，表示期望读取数据的长度，单位为Byte。可选，默认缓冲区长度。|

**返回值：**

  | 类型     | 说明       |
  | ------ | -------- |
  | number | 返回实际读取的数据长度，单位为Byte。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE);
  let buf = new ArrayBuffer(4096);
  fileIo.readSync(file.fd, buf);
  fileIo.closeSync(file);
  ```

## fileIo.rmdir

rmdir(path: string): Promise&lt;void&gt;

删除目录及其所有子目录和文件，使用promise异步回调。

> **说明：**
>
> 该接口支持删除单个文件，但不推荐使用此方法删除单个文件，推荐使用unlink接口删除单个文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| path   | string | 是   | 目录的应用沙箱路径。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir";
  fileIo.rmdir(dirPath).then(() => {
    console.info(`Succeeded in removing directory.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to remove directory. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.rmdir

rmdir(path: string, callback: AsyncCallback&lt;void&gt;): void

删除目录及其所有子目录和文件，使用callback异步回调。

> **说明：**
>
> 该接口支持删除单个文件，但不推荐使用此方法删除单个文件，推荐使用unlink接口删除单个文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                       |
| -------- | ------------------------- | ---- | -------------------------- |
| path     | string                    | 是   | 目录的应用沙箱路径。 |
| callback | AsyncCallback&lt;void&gt; | 是   | 异步删除目录之后的回调。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let dirPath = pathDir + "/testDir";
  fileIo.rmdir(dirPath, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to remove directory. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in removing directory.`);
    }
  });
  ```

## fileIo.rmdirSync

rmdirSync(path: string): void

以同步方法删除目录及其所有子目录和文件。

> **说明：**
>
> 该接口支持删除单个文件，但不推荐使用此方法删除单个文件，推荐使用unlinkSync接口删除单个文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| path   | string | 是   | 目录的应用沙箱路径。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let dirPath = pathDir + "/testDir";
  fileIo.rmdirSync(dirPath);
  ```

## fileIo.unlink

unlink(path: string): Promise&lt;void&gt;

删除单个文件，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| path   | string | 是   | 文件的应用沙箱路径。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.unlink(filePath).then(() => {
    console.info(`Succeeded in removing file.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to remove file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.unlink

unlink(path: string, callback: AsyncCallback&lt;void&gt;): void

删除文件，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                       |
| -------- | ------------------------- | ---- | -------------------------- |
| path     | string                    | 是   | 文件的应用沙箱路径。 |
| callback | AsyncCallback&lt;void&gt; | 是   | 异步删除文件之后的回调。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.unlink(filePath, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to remove file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in removing file.`);
    }
  });
  ```

## fileIo.unlinkSync

unlinkSync(path: string): void

以同步方法删除文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                       |
| ------ | ------ | ---- | -------------------------- |
| path   | string | 是   | 文件的应用沙箱路径。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  fileIo.unlinkSync(filePath);
  ```


## fileIo.write

write(fd: number, buffer: ArrayBuffer | string, options?: WriteOptions): Promise&lt;number&gt;

将数据写入文件，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名     | 类型                              | 必填   | 说明                                       |
  | ------- | ------------------------------- | ---- | ---------------------------------------- |
  | fd      | number                          | 是    | 已打开的文件描述符。                             |
  | buffer  | ArrayBuffer \| string | 是    | 待写入文件的数据，可来自缓冲区或字符串。                     |
  | options | [WriteOptions](#writeoptions11)                          | 否    | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望写入文件的位置，单位为Byte。可选，默认从当前位置开始写入。<br/>-&nbsp;length，number类型，表示期望写入数据的长度，单位为Byte。可选，默认缓冲区长度。<br/>-&nbsp;encoding，string类型，当数据是string类型时有效，表示数据的编码方式，默认&nbsp;'utf-8'。当前仅支持&nbsp;'utf-8'。|

**返回值：**

  | 类型                    | 说明       |
  | --------------------- | -------- |
  | Promise&lt;number&gt; | Promise对象。返回实际写入的数据长度，单位为Byte。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE);
  let str: string = "hello, world";
  fileIo.write(file.fd, str).then((writeLen: number) => {
    console.info(`Succeeded in writing data to file, size is: ${writeLen}`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to write data to file. Code: ${err.code}, message: ${err.message}`);
  }).finally(() => {
    fileIo.closeSync(file);
  });
  ```

## fileIo.write

write(fd: number, buffer: ArrayBuffer | string, options?: WriteOptions, callback: AsyncCallback&lt;number&gt;): void

将数据写入文件，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                              | 必填   | 说明                                       |
  | -------- | ------------------------------- | ---- | ---------------------------------------- |
  | fd       | number                          | 是    | 已打开的文件描述符。                             |
  | buffer   | ArrayBuffer \| string | 是    | 待写入文件的数据，可来自缓冲区或字符串。                     |
  | options | [WriteOptions](#writeoptions11)                          | 否    | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望写入文件的位置，单位为Byte。可选，默认从当前位置开始写。<br/>-&nbsp;length，number类型，表示期望写入数据的长度，单位为Byte。可选，默认缓冲区长度。<br/>-&nbsp;encoding，string类型，当数据是string类型时有效，表示数据的编码方式，默认&nbsp;'utf-8'。当前仅支持&nbsp;'utf-8'。|
  | callback | AsyncCallback&lt;number&gt;     | 是    | 异步将数据写入完成后执行的回调函数。返回实际写入的数据长度，单位为Byte。                       |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE);
  let str: string = "hello, world";
  fileIo.write(file.fd, str, (err: BusinessError, writeLen: number) => {
    if (err) {
      console.error(`Failed to write data to file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in writing data to file, size is: ${writeLen}`);
    }
    fileIo.closeSync(file);
  });
  ```

## fileIo.writeSync

writeSync(fd: number, buffer: ArrayBuffer | string, options?: WriteOptions): number

以同步方法将数据写入文件。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名     | 类型                              | 必填   | 说明                                       |
  | ------- | ------------------------------- | ---- | ---------------------------------------- |
  | fd      | number                          | 是    | 已打开的文件描述符。                             |
  | buffer  | ArrayBuffer \| string | 是    | 待写入文件的数据，可来自缓冲区或字符串。                     |
  | options | [WriteOptions](#writeoptions11)                          | 否    | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望写入文件的位置，单位为Byte。可选，默认从当前位置开始写。<br/>-&nbsp;length，number类型，表示期望写入数据的长度，单位为Byte。可选，默认缓冲区长度。<br/>-&nbsp;encoding，string类型，当数据是string类型时有效，表示数据的编码方式，默认&nbsp;'utf-8'。当前仅支持&nbsp;'utf-8'。|

**返回值：**

  | 类型     | 说明       |
  | ------ | -------- |
  | number | 返回实际写入的数据长度，单位为Byte。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE);
  let str: string = "hello, world";
  let writeLen = fileIo.writeSync(file.fd, str);
  console.info(`Succeeded in writing data to file, size is: ${writeLen}`);
  fileIo.closeSync(file);
  ```

## fileIo.truncate

truncate(file: string | number, len?: number): Promise&lt;void&gt;

截断文件，使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                             |
| ------ | ------ | ---- | -------------------------------- |
| file   | string \| number | 是   | 文件的应用沙箱路径或已打开的文件描述符fd。       |
| len    | number | 否   | 文件截断后的长度，单位为Byte。默认为0。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let len: number = 5;
  fileIo.truncate(filePath, len).then(() => {
    console.info(`Succeeded in truncating file.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to truncate file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.truncate

truncate(file: string | number, len?: number, callback: AsyncCallback&lt;void&gt;): void

截断文件，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                             |
| -------- | ------------------------- | ---- | -------------------------------- |
| file     | string \| number                    | 是   | 文件的应用沙箱路径或已打开的文件描述符fd。       |
| len      | number                    | 否   | 文件截断后的长度，单位为Byte。默认为0。 |
| callback | AsyncCallback&lt;void&gt; | 是   | 回调函数，本调用无返回值。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let len: number = 5;
  fileIo.truncate(filePath, len, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to truncate. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in truncating.`);
    }
  });
  ```

## fileIo.truncateSync

truncateSync(file: string | number, len?: number): void

以同步方法截断文件内容。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型   | 必填 | 说明                             |
| ------ | ------ | ---- | -------------------------------- |
| file   | string \| number | 是   | 文件的应用沙箱路径或已打开的文件描述符fd。       |
| len    | number | 否   | 文件截断后的长度，单位为Byte。默认为0。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let len: number = 5;
  fileIo.truncateSync(filePath, len);
  ```

## fileIo.readText

readText(filePath: string, options?: ReadTextOptions): Promise&lt;string&gt;

基于文本方式读取文件（即直接读取文件的文本内容），使用promise异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型   | 必填 | 说明                                                         |
| -------- | ------ | ---- | ------------------------------------------------------------ |
| filePath | string | 是   | 文件的应用沙箱路径。                                   |
| options  | [ReadTextOptions](#readtextoptions11) | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读取。<br/>-&nbsp;length，number类型，表示期望读取数据，单位为Byte。可选，默认文件长度。<br/>-&nbsp;encoding，string类型，当数据是&nbsp;string&nbsp;类型时有效，表示数据的编码方式，默认&nbsp;'utf-8'，仅支持&nbsp;'utf-8'。 |

**返回值：**

  | 类型                    | 说明         |
  | --------------------- | ---------- |
  | Promise&lt;string&gt; | Promise对象。返回读取文件的内容。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  fileIo.readText(filePath).then((str: string) => {
    console.info(`Succeeded in reading text, text is: ${str}`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to read text. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.readText

readText(filePath: string, options?: ReadTextOptions, callback: AsyncCallback&lt;string&gt;): void

基于文本方式读取文件内容，使用callback异步回调。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                        | 必填 | 说明                                                         |
| -------- | --------------------------- | ---- | ------------------------------------------------------------ |
| filePath | string                      | 是   | 文件的应用沙箱路径。                                   |
| options  | [ReadTextOptions](#readtextoptions11)                      | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读取。<br/>-&nbsp;length，number类型，表示期望读取数据，单位为Byte。可选，默认文件长度。<br/>-&nbsp;encoding，string类型，表示数据的编码方式，默认&nbsp;'utf-8'，仅支持&nbsp;'utf-8'。 |
| callback | AsyncCallback&lt;string&gt; | 是   | 回调函数，返回读取文件的内容。                         |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { ReadTextOptions } from '@kit.CoreFileKit';

  let filePath = pathDir + "/test.txt";
  let stat = fileIo.statSync(filePath);
  let readTextOption: ReadTextOptions = {
      offset: 1,
      length: stat.size,
      encoding: 'utf-8'
  };
  fileIo.readText(filePath, readTextOption, (err: BusinessError, str: string) => {
    if (err) {
      console.error(`Failed to read text. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in reading text, text is: ${str}`);
    }
  });
  ```

## fileIo.readTextSync

readTextSync(filePath: string, options?: ReadTextOptions): string

以同步方法基于文本方式读取文件（即直接读取文件的文本内容）。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型   | 必填 | 说明                                                         |
| -------- | ------ | ---- | ------------------------------------------------------------ |
| filePath | string | 是   | 文件的应用沙箱路径。                                   |
| options  | [ReadTextOptions](#readtextoptions11) | 否   | 支持如下选项：<br/>-&nbsp;offset，number类型，表示期望读取文件的位置，单位为Byte。可选，默认从当前位置开始读取。<br/>-&nbsp;length，number类型，表示期望读取数据，单位为Byte。可选，默认文件长度。<br/>-&nbsp;encoding，string类型，当数据是&nbsp;string&nbsp;类型时有效，表示数据的编码方式，默认&nbsp;'utf-8'，仅支持&nbsp;'utf-8'。 |

**返回值：**

  | 类型   | 说明                 |
  | ------ | -------------------- |
  | string | 返回读取文件的内容。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { ReadTextOptions } from '@kit.CoreFileKit';

  let filePath = pathDir + "/test.txt";
  let readTextOptions: ReadTextOptions = {
    offset: 1,
    length: 0,
    encoding: 'utf-8'
  };
  let stat = fileIo.statSync(filePath);
  readTextOptions.length = stat.size;
  let str = fileIo.readTextSync(filePath, readTextOptions);
  console.info(`Succeeded in reading text, text is: ${str}`);
  ```

## fileIo.rename

rename(oldPath: string, newPath: string): Promise&lt;void&gt;

重命名文件或目录，使用promise异步回调。

> **说明：**
> 
> 该接口不支持在分布式文件路径下操作。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名  | 类型   | 必填 | 说明                         |
| ------- | ------ | ---- | ---------------------------- |
| oldPath | string | 是   | 文件的应用沙箱原路径。 |
| newPath | string | 是   | 文件的应用沙箱新路径。   |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcFile = pathDir + "/test.txt";
  let dstFile = pathDir + "/new.txt";
  fileIo.rename(srcFile, dstFile).then(() => {
    console.info(`Succeeded in renaming.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to rename. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.rename

rename(oldPath: string, newPath: string, callback: AsyncCallback&lt;void&gt;): void

重命名文件或目录，使用callback异步回调。

> **说明：**
> 
> 该接口不支持在分布式文件路径下操作。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名   | 类型                      | 必填 | 说明                         |
| -------- | ------------------------- | ---- | ---------------------------- |
| oldPath | string | 是   | 文件的应用沙箱原路径。 |
| newPath | string | 是   | 文件的应用沙箱新路径。   |
| callback | AsyncCallback&lt;void&gt; | 是   | 异步重命名文件之后的回调。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcFile = pathDir + "/test.txt";
  let dstFile = pathDir + "/new.txt";
  fileIo.rename(srcFile, dstFile, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to rename. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in renaming.`);
    }
  });
  ```

## fileIo.renameSync

renameSync(oldPath: string, newPath: string): void

以同步方法重命名文件或目录。

> **说明：**
>
> 该接口不支持在分布式文件路径下操作。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名  | 类型   | 必填 | 说明                         |
| ------- | ------ | ---- | ---------------------------- |
| oldPath | string | 是   | 文件的应用沙箱原路径。 |
| newPath | string | 是   | 文件的应用沙箱新路径。   |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let srcFile = pathDir + "/test.txt";
  let dstFile = pathDir + "/new.txt";
  fileIo.renameSync(srcFile, dstFile);
  ```

## fileIo.fsync

fsync(fd: number): Promise&lt;void&gt;

将文件系统缓存数据写入磁盘，使用promise异步回调。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型     | 必填   | 说明           |
  | ---- | ------ | ---- | ------------ |
  | fd   | number | 是    | 已打开的文件描述符。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.fsync(file.fd).then(() => {
    console.info(`Succeeded in syncing data.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to sync data. Code: ${err.code}, message: ${err.message}`);
  }).finally(() => {
    fileIo.closeSync(file);
  });
  ```

## fileIo.fsync

fsync(fd: number, callback: AsyncCallback&lt;void&gt;): void

将文件系统缓存数据写入磁盘，使用callback异步回调。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名      | 类型                        | 必填   | 说明              |
  | -------- | ------------------------- | ---- | --------------- |
  | fd       | number                    | 是    | 已打开的文件描述符。    |
  | callback | AsyncCallback&lt;void&gt; | 是    | 异步将文件数据同步之后的回调。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.fsync(file.fd, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to sync. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in syncing.`);
    }
    fileIo.closeSync(file);
  });
  ```


## fileIo.fsyncSync

fsyncSync(fd: number): void

以同步方法将文件系统缓存数据写入磁盘。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名  | 类型     | 必填   | 说明           |
  | ---- | ------ | ---- | ------------ |
  | fd   | number | 是    | 已打开的文件描述符。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let filePath = pathDir + "/test.txt";
  let file = fileIo.openSync(filePath);
  fileIo.fsyncSync(file.fd);
  fileIo.closeSync(file);
  ```

## fileIo.listFile
listFile(path: string, options?: ListFileOptions): Promise<string[]>

默认列出当前目录下所有文件名和目录名。支持过滤。使用promise异步回调。

可通过配置options中recursion参数实现递归列出所有文件的相对路径，相对路径以“/”开头。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | path | string | 是    | 目录的应用沙箱路径。 |
  | options | [ListFileOptions](#listfileoptions11) | 否    | 文件过滤选项。默认不进行过滤。 |


**返回值：**

  | 类型                   | 说明         |
  | --------------------- | ---------- |
  | Promise&lt;string[]&gt; | Promise对象。返回文件名数组，默认以'utf-8'编码。|

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { Filter, ListFileOptions } from '@kit.CoreFileKit';

  let listFileOption: ListFileOptions = {
    recursion: false,
    listNum: 0,
    filter: {
      suffix: [".png", ".jpg", ".jpeg"],
      displayName: ["*abc", "efg*"],
      fileSizeOver: 1024
    }
  }
  fileIo.listFile(pathDir, listFileOption).then((filenames: Array<string>) => {
    console.info(`Succeeded in listing file.`);
    for (let i = 0; i < filenames.length; i++) {
      console.info(`Succeeded in listing file, file name: ${filenames[i]}`);
    }
  }).catch((err: BusinessError) => {
    console.error(`Failed to list file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.listFile
listFile(path: string, options?: ListFileOptions, callback: AsyncCallback<string[]>): void

默认列出当前目录下所有文件名和目录名。支持过滤。使用callback异步回调。

可通过配置options中recursion参数实现递归列出所有文件的相对路径，相对路径以“/”开头。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | path | string | 是    | 目录的应用沙箱路径。 |
  | options | [ListFileOptions](#listfileoptions11) | 否    | 文件过滤选项。默认不进行过滤。 |
  | callback | AsyncCallback&lt;string[]&gt; | 是    | 异步列出文件名数组之后的回调，默认以'utf-8'编码。|


**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';
  import { Filter, ListFileOptions } from '@kit.CoreFileKit';

  let listFileOption: ListFileOptions = {
    recursion: false,
    listNum: 0,
    filter: {
      suffix: [".png", ".jpg", ".jpeg"],
      displayName: ["*abc", "efg*"],
      fileSizeOver: 1024
    }
  };
  fileIo.listFile(pathDir, listFileOption, (err: BusinessError, filenames: Array<string>) => {
    if (err) {
      console.error(`Failed to list file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in listing file.`);
      for (let i = 0; i < filenames.length; i++) {
        console.info(`Succeeded in listing file, file name: ${filenames[i]}`);
      }
    }
  });
  ```

## fileIo.listFileSync

listFileSync(path: string, options?: ListFileOptions): string[]

默认以同步方式列出当前目录下所有文件名和目录名。支持过滤。

可通过配置options中recursion参数实现递归列出所有文件的相对路径，相对路径以“/”开头。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | path | string | 是    | 目录的应用沙箱路径。 |
  | options | [ListFileOptions](#listfileoptions11) | 否    | 文件过滤选项。默认不进行过滤。 |


**返回值：**

  | 类型                   | 说明         |
  | --------------------- | ---------- |
  | string[] | 返回文件名数组，默认以'utf-8'编码。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { Filter, ListFileOptions} from '@kit.CoreFileKit';

  let listFileOption: ListFileOptions = {
    recursion: false,
    listNum: 0,
    filter: {
      suffix: [".png", ".jpg", ".jpeg"],
      displayName: ["*abc", "efg*"],
      fileSizeOver: 1024
    }
  };
  let filenames = fileIo.listFileSync(pathDir, listFileOption);
  console.info(`Succeeded in listing file.`);
  for (let i = 0; i < filenames.length; i++) {
    console.info(`Succeeded in listing file, file name: ${filenames[i]}`);
  }
  ```

## fileIo.listFileExt

listFileExt(path: string, options?: ListFileExtOptions): Promise&lt;string[]&gt;

列出目录下所有文件名，支持递归列出和自定义文件名过滤。使用Promise异步回调。

可通过配置options中recursion参数实现递归列出所有文件的相对路径，相对路径以“/”开头。

**起始版本**：26.0.0

**模型约束**：此接口仅可在Stage模型下使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型 | 必填 | 说明 |
| ------ | ------ | ---- | ----- |
| path | string | 是 | 目录的应用沙箱路径。 |
| options | [ListFileExtOptions](#listfileextoptions) | 否 | 文件列出选项。默认为空，表示不递归、不限制列出数量、不进行过滤。 |

**返回值：**

| 类型 | 说明 |
| ---- | ---- |
| Promise&lt;string[]&gt; | Promise对象，返回文件名数组。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

| 错误码ID | 错误信息 |
| -------- | -------- |
| 13900002 | No such file or directory. |
| 13900011 | Out of memory. |
| 13900018 | Not a directory. |
| 13900020 | Invalid argument. |

**示例：**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo, ListFileExtOptions, FileFilter } from '@kit.CoreFileKit';

let filter: FileFilter = {
  filter: (name: string): boolean => {
    return name.endsWith('.txt');
  }
};
let options: ListFileExtOptions = {
  recursion: false,
  listNum: 0,
  fileFilter: filter
};
fileIo.listFileExt(pathDir, options).then((filenames: Array<string>) => {
  console.info(`Succeeded in listing file.`);
  for (let i = 0; i < filenames.length; i++) {
    console.info(`Succeeded in listing file, file name: ${filenames[i]}`);
  }
}).catch((error: Error) => {
  let err: BusinessError = error as BusinessError;
  console.error(`Failed to list file. Code: ${err.code}, message: ${err.message}`);
});
```

## fileIo.listFileExtSync

listFileExtSync(path: string, options?: ListFileExtOptions): string[]

以同步方式列出目录下所有文件名，支持递归列出和自定义文件名过滤。

可通过配置options中recursion参数实现递归列出所有文件的相对路径，相对路径以“/”开头。

**起始版本**：26.0.0

**模型约束**：此接口仅可在Stage模型下使用。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

| 参数名 | 类型 | 必填 | 说明 |
| ------ | ------ | ---- | ----- |
| path | string | 是 | 目录的应用沙箱路径。 |
| options | [ListFileExtOptions](#listfileextoptions) | 否 | 文件列出选项。默认为空，表示不递归、不限制列出数量、不进行过滤。 |

**返回值：**

| 类型 | 说明 |
| ---- | ---- |
| string[] | 返回文件名数组。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

| 错误码ID | 错误信息 |
| -------- | -------- |
| 13900002 | No such file or directory. |
| 13900011 | Out of memory. |
| 13900018 | Not a directory. |
| 13900020 | Invalid argument. |

**示例：**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo, ListFileExtOptions, FileFilter } from '@kit.CoreFileKit';

let filter: FileFilter = {
  filter: (name: string): boolean => {
    return name.endsWith('.txt');
  }
};
let options: ListFileExtOptions = {
  recursion: false,
  listNum: 0,
  fileFilter: filter
};
try {
  let filenames = fileIo.listFileExtSync(pathDir, options);
  console.info(`Succeeded in listing file.`);
  for (let i = 0; i < filenames.length; i++) {
    console.info(`Succeeded in listing file, file name: ${filenames[i]}`);
  }
} catch (error) {
  let err = error as BusinessError;
  console.error(`Failed to list file. Code: ${err.code}, message: ${err.message}`);
}
```

## fileIo.moveFile

moveFile(src: string, dest: string, mode?: number): Promise\<void>

移动文件，使用promise异步回调。

> **说明：**
>
> 该接口不支持在分布式文件路径下操作。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源文件的应用沙箱路径。 |
  | dest | string | 是    | 目标文件的应用沙箱路径。 |
  | mode | number | 否    | 移动模式。若mode为0，移动位置存在同名文件时，强制移动覆盖。若mode为1，移动位置存在同名文件时，抛出异常。默认为0。 |

**返回值：**

  | 类型                  | 说明                           |
  | ------------------- | ---------------------------- |
  | Promise&lt;void&gt; | Promise对象。无返回值。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/source.txt";
  let destPath = pathDir + "/dest.txt";
  fileIo.moveFile(srcPath, destPath, 0).then(() => {
    console.info(`Succeeded in moving file.`);
  }).catch((err: BusinessError) => {
    console.error(`Failed to move file. Code: ${err.code}, message: ${err.message}`);
  });
  ```

## fileIo.moveFile

moveFile(src: string, dest: string, mode: number, callback: AsyncCallback\<void>): void

移动文件，支持设置移动模式。使用callback异步回调。

> **说明：**
>
> 该接口不支持在分布式文件路径下操作。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源文件的应用沙箱路径。 |
  | dest | string | 是    | 目标文件的应用沙箱路径。 |
  | mode | number | 是    | 移动模式。若mode为0，移动位置存在同名文件时，强制移动覆盖。若mode为1，移动位置存在同名文件时，抛出异常。默认为0。 |
  | callback | AsyncCallback&lt;void&gt; | 是    | 异步移动文件之后的回调。              |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/source.txt";
  let destPath = pathDir + "/dest.txt";
  fileIo.moveFile(srcPath, destPath, 0, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to move file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in moving file.`);
    }
  });
  ```

## fileIo.moveFile

moveFile(src: string, dest: string, callback: AsyncCallback\<void>): void

移动文件。如果移动位置存在同名文件，将强制覆盖。使用callback异步回调。

> **说明：**
>
> 该接口不支持在分布式文件路径下操作。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源文件的应用沙箱路径。 |
  | dest | string | 是    | 目标文件的应用沙箱路径。 |
  | callback | AsyncCallback&lt;void&gt; | 是    | 异步移动文件之后的回调。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  import { BusinessError } from '@kit.BasicServicesKit';

  let srcPath = pathDir + "/source.txt";
  let destPath = pathDir + "/dest.txt";
  fileIo.moveFile(srcPath, destPath, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to move file. Code: ${err.code}, message: ${err.message}`);
    } else {
      console.info(`Succeeded in moving file.`);
    }
  });
  ```

## fileIo.moveFileSync

moveFileSync(src: string, dest: string, mode?: number): void

以同步方式移动文件。

> **说明：**
>
> 该接口不支持在分布式文件路径下操作。

**系统能力**：SystemCapability.FileManagement.File.FileIO

**参数：**

  | 参数名    | 类型     | 必填   | 说明                          |
  | ------ | ------ | ---- | --------------------------- |
  | src | string | 是    | 源文件的应用沙箱路径。 |
  | dest | string | 是    | 目标文件的应用沙箱路径。 |
  | mode | number | 否    | 移动模式。若mode为0，移动位置存在同名文件时，强制移动覆盖。若mode为1，移动位置存在同名文件时，抛出异常。默认为0。 |

**错误码：**

接口抛出错误码的详细介绍请参见[基础文件IO错误码](errorcode-filemanagement.md#基础文件io错误码)。

**示例：**

  ```ts
  let srcPath = pathDir + "/source.txt";
  let destPath = pathDir + "/dest.txt";
  fileIo.moveFileSync(srcPath, destPath, 0);
  console.info(`Succeeded in moving file.`);
  ```
