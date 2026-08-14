> **节选说明 / Excerpt note**：本文件为官方文档节选（CC-BY-4.0）：仅保留以下小节，未修改任何文字。原文：https://gitee.com/openharmony/docs/raw/b84779874332bd7c2afee0ca3875494fa4793f1f/zh-cn/application-dev/reference/apis-sensor-service-kit/js-apis-sensor.md

## 导入模块

```ts
import { sensor } from '@kit.SensorServiceKit';
```

## sensor.on('SensorId.ACCELEROMETER')<sup>9+</sup>

on(type: SensorId.ACCELEROMETER, callback: Callback&lt;AccelerometerResponse&gt;, options?: Options): void

订阅加速度传感器数据。

**需要权限**：ohos.permission.ACCELEROMETER

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                                         | 必填 | 说明                                                        |
| -------- | ------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| type     | [SensorId](#sensorid9).ACCELEROMETER                         | 是   | 传感器类型，该值固定为SensorId.ACCELEROMETER。              |
| callback | Callback&lt;[AccelerometerResponse](#accelerometerresponse)&gt; | 是   | 回调函数，异步上报的传感器数据固定为AccelerometerResponse。 |
| options  | [Options](#options)                                          | 否   | 可选参数列表，用于设置传感器上报频率，默认值为200000000ns。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 201      | Permission denied.                                           |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.on(sensor.SensorId.ACCELEROMETER, (data: sensor.AccelerometerResponse) => {
    console.info('Succeeded in invoking on. X-coordinate component: ' + data.x);
    console.info('Succeeded in invoking on. Y-coordinate component: ' + data.y);
    console.info('Succeeded in invoking on. Z-coordinate component: ' + data.z);
  }, { interval: 100000000 });
  setTimeout(() => {
    sensor.off(sensor.SensorId.ACCELEROMETER);
  }, 500);
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to invoke on. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.on('SensorId.GYROSCOPE')<sup>9+</sup>

on(type: SensorId.GYROSCOPE, callback: Callback&lt;GyroscopeResponse&gt;, options?: Options): void

订阅校准的陀螺仪传感器数据。

**需要权限**：ohos.permission.GYROSCOPE

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                                    | 必填 | 说明                                                        |
| -------- | ------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| type     | [SensorId](#sensorid9).GYROSCOPE                        | 是   | 传感器类型，该值固定为SensorId.GYROSCOPE。                  |
| callback | Callback&lt;[GyroscopeResponse](#gyroscoperesponse)&gt; | 是   | 回调函数，异步上报的传感器数据固定为GyroscopeResponse。     |
| options  | [Options](#options)                                     | 否   | 可选参数列表，用于设置传感器上报频率，默认值为200000000ns。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 201      | Permission denied.                                           |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.on(sensor.SensorId.GYROSCOPE, (data: sensor.GyroscopeResponse) => {
    console.info('Succeeded in invoking on. X-coordinate component: ' + data.x);
    console.info('Succeeded in invoking on. Y-coordinate component: ' + data.y);
    console.info('Succeeded in invoking on. Z-coordinate component: ' + data.z);
  }, { interval: 100000000 });
  setTimeout(() => {
    sensor.off(sensor.SensorId.GYROSCOPE);
  }, 500);
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to invoke on. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.once('SensorId.ACCELEROMETER')<sup>9+</sup>

once(type: SensorId.ACCELEROMETER, callback: Callback&lt;AccelerometerResponse&gt;): void

获取一次加速度传感器数据。

**需要权限**：ohos.permission.ACCELEROMETER 

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                                         | 必填 | 说明                                                        |
| -------- | ------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| type     | [SensorId](#sensorid9).ACCELEROMETER                         | 是   | 传感器类型，该值固定为SensorId.ACCELEROMETER。              |
| callback | Callback&lt;[AccelerometerResponse](#accelerometerresponse)&gt; | 是   | 回调函数，异步上报的传感器数据固定为AccelerometerResponse。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 201      | Permission denied.                                           |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.once(sensor.SensorId.ACCELEROMETER, (data: sensor.AccelerometerResponse) => {
    console.info('Succeeded in invoking once. X-coordinate component: ' + data.x);
    console.info('Succeeded in invoking once. Y-coordinate component: ' + data.y);
    console.info('Succeeded in invoking once. Z-coordinate component: ' + data.z);
  });
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to invoke once. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.off('SensorId.ACCELEROMETER')<sup>9+</sup>

off(type: SensorId.ACCELEROMETER, callback?: Callback&lt;AccelerometerResponse&gt;): void

取消订阅加速度传感器数据。

**需要权限**：ohos.permission.ACCELEROMETER

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                                         | 必填 | 说明                                                         |
| -------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| type     | [SensorId](#sensorid9).ACCELEROMETER                         | 是   | 传感器类型，该值固定为SensorId.ACCELEROMETER。               |
| callback | Callback&lt;[AccelerometerResponse](#accelerometerresponse)&gt; | 否   | 需要取消订阅的回调函数，若无此参数，则取消订阅当前类型的所有回调函数。 |

**错误码**：

以下错误码的详细介绍请参见[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 201      | Permission denied.                                           |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

function callback1(data: object) {
  console.info('Succeeded in getting callback1 data: ' + JSON.stringify(data));
}

function callback2(data: object) {
  console.info('Succeeded in getting callback2 data: ' + JSON.stringify(data));
}

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.on(sensor.SensorId.ACCELEROMETER, callback1);
  sensor.on(sensor.SensorId.ACCELEROMETER, callback2);
  // 仅取消callback1的注册
  sensor.off(sensor.SensorId.ACCELEROMETER, callback1);
  // 取消SensorId.ACCELEROMETER类型的所有回调
  sensor.off(sensor.SensorId.ACCELEROMETER);
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to invoke off. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.off('SensorId.ACCELEROMETER')<sup>19+</sup>

off(type: SensorId.ACCELEROMETER, sensorInfoParam?: SensorInfoParam, callback?: Callback&lt;AccelerometerResponse&gt;): void

取消订阅加速度传感器数据。

**需要权限**：ohos.permission.ACCELEROMETER

**原子化服务API**：从API version 19开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名                | 类型                                                         | 必填 | 说明                                                         |
|--------------------| ------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| type               | [SensorId](#sensorid9).ACCELEROMETER                         | 是   | 传感器类型，该值固定为SensorId.ACCELEROMETER。               |
| sensorInfoParam    | [SensorInfoParam](#sensorinfoparam19) |  否 | 传感器传入设置参数，可指定deviceId、sensorIndex |
| callback           | Callback&lt;[AccelerometerResponse](#accelerometerresponse)&gt; | 否   | 需要取消订阅的回调函数，若无此参数，则取消订阅当前类型的所有回调函数。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 201      | Permission denied.                                           |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

enum Ret { OK, Failed = -1 }

// 传感器回调
const sensorCallback = (response: sensor.AccelerometerResponse) => {
  console.info(`callback response: ${JSON.stringify(response)}`);
}
// 传感器监听类别
const sensorType = sensor.SensorId.ACCELEROMETER;
const sensorInfoParam: sensor.SensorInfoParam = { deviceId: -1, sensorIndex: 0 };

function sensorSubscribe(): Ret {
  let ret: Ret = Ret.OK;
  // 使用try catch对可能出现的异常进行捕获
  try {
    // 查询所有的传感器
    const sensorList: sensor.Sensor[] = sensor.getSensorListSync();
    if (!sensorList.length) {
      return Ret.Failed;
    }
    // 根据实际业务逻辑获取目标传感器。
    const targetSensor = sensorList
      // 按需过滤deviceId为1、sensorId为2的所有传感器。此处示例仅做展示，开发者需要自行调整筛选逻辑。
      .filter((sensor: sensor.Sensor) => sensor.deviceId === 1 && sensor.sensorId === 2)
      // 可能存在的多个同类型传感器，选择sensorIndex为0的传感器。
      .find((sensor: sensor.Sensor) => sensor.sensorIndex === 0);
    if (!targetSensor) {
      return Ret.Failed;
    }
    sensorInfoParam.deviceId = targetSensor.deviceId;
    sensorInfoParam.sensorIndex = targetSensor.sensorIndex;
    // 订阅传感器事件
    sensor.on(sensorType, sensorCallback, { sensorInfoParam });
  } catch (error) {
    let e: BusinessError = error as BusinessError;
    console.error(`Failed to invoke sensor.on. Code: ${e.code}, message: ${e.message}`);
    ret = Ret.Failed;
  }
  return ret;
}

function sensorUnsubscribe(): Ret {
  let ret: Ret = Ret.OK;
  // 使用try catch对可能出现的异常进行捕获
  try {
    sensor.off(sensorType, sensorInfoParam, sensorCallback);
  } catch (error) {
    let e: BusinessError = error as BusinessError;
    console.error(`Failed to invoke sensor.off. Code: ${e.code}, message: ${e.message}`);
    ret = Ret.Failed;
  }
  return ret;
}
```

## sensor.getSensorListByDeviceSync<sup>19+</sup> 

getSensorListByDeviceSync(deviceId?: number): Array&lt;Sensor&gt; 

同步获取设备的所有传感器信息。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名          | 类型                                                         | 必填 | 说明     |
| --------------- | ------------------------------------------------------------ | ---- |--------|
| deviceId | number                 | 否   | 设备ID，默认为查询本地设备，默认值为-1，表示本地设备，设备ID需通过[getSensorList](#sensorgetsensorlist9)查询或者监听设备上下线接口[sensorStatusChange](#sensoronsensorstatuschange19)获取。 |


**返回值**：

| 类型                                                       | 说明           |
| ---------------------------------------------------------- | -------------- |
| Array&lt;[Sensor](#sensor9)&gt;           | 传感器属性列表。                  |


**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

try {
  const deviceId = 1;
  // 第一个参数deviceId 非必填
  const sensorList: sensor.Sensor[] = sensor.getSensorListByDeviceSync(deviceId);
  console.info(`sensorList length: ${sensorList.length}`);
  console.info(`sensorList: ${JSON.stringify(sensorList)}`);
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get sensorList. Code: ${e.code}, message: ${e.message}`);
}
```


## sensor.getSingleSensorByDeviceSync<sup>19+</sup> 

getSingleSensorByDeviceSync(type: SensorId, deviceId?: number): Array&lt;Sensor&gt;

同步获取指定设备和类型的传感器信息。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名          | 类型                                                         | 必填 | 说明       |
| --------------- | ------------------------------------------------------------ | ---- |----------|
| type     | [SensorId](#sensorid9) | 是   | 指定传感器类型。 |
| deviceId | number                 | 否   | 设备ID，默认为查询本地设备，默认值为-1，表示本地设备，设备ID需通过[getSensorList](#sensorgetsensorlist9)查询或者监听设备上下线接口[sensorStatusChange](#sensoronsensorstatuschange19)获取。 |


**返回值**：

| 类型                                                       | 说明           |
| ---------------------------------------------------------- | -------------- |
| Array&lt;[Sensor](#sensor9)&gt;           | 传感器属性列表。                  |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

try {
  const deviceId = 1;
  // 第二个参数deviceId 非必填
  const sensorList: sensor.Sensor[] = sensor.getSingleSensorByDeviceSync(sensor.SensorId.ACCELEROMETER, deviceId);
  console.info(`sensorList length: ${sensorList.length}`);
  console.info(`sensorList Json: ${JSON.stringify(sensorList)}`);
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get sensorList. Code: ${e.code}, message: ${e.message}`);
}
```


## sensor.getSensorList<sup>9+</sup>

getSensorList(callback: AsyncCallback&lt;Array&lt;Sensor&gt;&gt;): void

获取设备上的所有传感器信息，使用Callback异步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                           | 必填 | 说明             |
| -------- | ---------------------------------------------- | ---- | ---------------- |
| callback | AsyncCallback&lt;Array&lt;[Sensor](#sensor9)&gt;&gt; | 是   | 回调函数，异步返回传感器属性列表。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.getSensorList((err: BusinessError, data: Array<sensor.Sensor>) => {
    if (err) {
      console.error(`Failed to get sensorList. Code: ${err.code}, message: ${err.message}`);
      return;
    }
    for (let i = 0; i < data.length; i++) {
      console.info('Succeeded in getting data[' + i + ']: ' + JSON.stringify(data[i]));
    }
  });
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get sensorList. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.getSensorList<sup>9+</sup>

 getSensorList(): Promise&lt;Array&lt;Sensor&gt;&gt;

获取设备上的所有传感器信息，使用Promise异步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**返回值**：

| 类型                                     | 说明             |
| ---------------------------------------- | ---------------- |
| Promise&lt;Array&lt;[Sensor](#sensor9)&gt;&gt; | Promise对象，使用异步方式返回传感器属性列表。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.getSensorList().then((data: Array<sensor.Sensor>) => {
    for (let i = 0; i < data.length; i++) {
      console.info('Succeeded in getting data[' + i + ']: ' + JSON.stringify(data[i]));
    }
  }, (err: BusinessError) => {
    console.error(`Failed to get sensorList. Code: ${err.code}, message: ${err.message}`);
  });
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get sensorList. Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.getSensorListSync<sup>12+</sup>

getSensorListSync(): Array&lt;Sensor&gt;

获取设备上的所有传感器信息，使用同步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**返回值**：

| 类型                                    | 说明                             |
| --------------------------------------- | -------------------------------- |
| Array&lt;[Sensor](#sensor9)&gt; | 使用同步方式返回传感器属性列表。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息           |
| -------- | ------------------ |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  let ret = sensor.getSensorListSync()
  for (let i = 0; i < ret.length; i++) {
    console.info('Succeeded in getting sensor: ' + JSON.stringify(ret[i]));
  }
} catch(error) {
    let e: BusinessError = error as BusinessError;
    console.error(`Failed to get singleSensor . Code: ${e.code}, message: ${e.message}`);
}
```

##  sensor.getSingleSensor<sup>9+</sup>

getSingleSensor(type: SensorId, callback: AsyncCallback&lt;Sensor&gt;): void

获取指定传感器类型的属性信息，使用Callback异步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名   | 类型                                    | 必填 | 说明             |
| -------- | --------------------------------------- | ---- | ---------------- |
| type     | [SensorId](#sensorid9)                  | 是   | 指定传感器类型。     |
| callback | AsyncCallback&lt;[Sensor](#sensor9)&gt; | 是   | 回调函数，异步返回指定传感器的属性信息。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |
| 14500102 | The sensor is not supported by the device.                   |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.getSingleSensor(sensor.SensorId.ACCELEROMETER, (err: BusinessError, data: sensor.Sensor) => {
    if (err) {
      console.error(`Failed to get singleSensor. Code: ${err.code}, message: ${err.message}`);
      return;
    }
    console.info('Succeeded in getting sensor: ' + JSON.stringify(data));
    sensor.on(sensor.SensorId.ACCELEROMETER, (data: sensor.AccelerometerResponse) => {
      console.info('Succeeded in invoking on. X-coordinate component: ' + data.x);
      console.info('Succeeded in invoking on. Y-coordinate component: ' + data.y);
      console.info('Succeeded in invoking on. Z-coordinate component: ' + data.z);
    }, { interval: 100000000 });
    setTimeout(() => {
      sensor.off(sensor.SensorId.ACCELEROMETER);
    }, 500);
  });
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get singleSensor. Code: ${e.code}, message: ${e.message}`);
}
```

##  sensor.getSingleSensor<sup>9+</sup>

 getSingleSensor(type: SensorId): Promise&lt;Sensor&gt;

获取指定类型的传感器信息，使用Promise异步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名 | 类型                   | 必填 | 说明         |
| ------ | ---------------------- | ---- | ------------ |
| type   | [SensorId](#sensorid9) | 是   | 传感器类型。 |

**返回值**：

| 类型                              | 说明                         |
| --------------------------------- | ---------------------------- |
| Promise&lt;[Sensor](#sensor9)&gt; | 使用异步方式返回传感器信息。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |
| 14500102 | The sensor is not supported by the device.                   |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  sensor.getSingleSensor(sensor.SensorId.ACCELEROMETER).then((data: sensor.Sensor) => {
    console.info('Succeeded in getting sensor: ' + JSON.stringify(data));
  }, (err: BusinessError) => {
    console.error(`Failed to get singleSensor . Code: ${err.code}, message: ${err.message}`);
  });
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get singleSensor . Code: ${e.code}, message: ${e.message}`);
}
```

## sensor.getSingleSensorSync<sup>12+</sup>

getSingleSensorSync(type: SensorId): Sensor

获取指定类型的传感器信息，使用同步方式返回结果。

**系统能力**：SystemCapability.Sensors.Sensor

**参数**：

| 参数名 | 类型                   | 必填 | 说明         |
| ------ | ---------------------- | ---- | ------------ |
| type   | [SensorId](#sensorid9) | 是   | 传感器类型。 |

**返回值**：

| 类型   | 说明                         |
| ------ | ---------------------------- |
| Sensor | 使用同步方式返回传感器信息。 |

**错误码**：

以下错误码的详细介绍请参见[传感器错误码](errorcode-sensor.md)和[通用错误码](../errorcode-universal.md)。错误码和错误信息会以异常的形式抛出，调用接口时需要使用try catch对可能出现的异常进行捕获操作。

| 错误码ID | 错误信息                                                     |
| -------- | ------------------------------------------------------------ |
| 401      | Parameter error.Possible causes:1. Mandatory parameters are left unspecified;2. Incorrect parameter types;3. Parameter verification failed. |
| 14500101 | Service exception.Possible causes:1. Sensor hdf service exception;2. Sensor service ipc exception;3.Sensor data channel exception. |
| 14500102 | The sensor is not supported by the device.                   |

**示例**：

```ts
import { sensor } from '@kit.SensorServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

// 使用try catch对可能出现的异常进行捕获
try {
  let ret = sensor.getSingleSensorSync(sensor.SensorId.ACCELEROMETER);
  console.info('Succeeded in getting sensor: ' + JSON.stringify(ret));
} catch (error) {
  let e: BusinessError = error as BusinessError;
  console.error(`Failed to get singleSensor . Code: ${e.code}, message: ${e.message}`);
}
```

## SensorId<sup>9+</sup>

表示当前支持订阅或取消订阅的传感器类型。

**系统能力**：SystemCapability.Sensors.Sensor

| 名称                        | 值   | 说明                                                         |
| --------------------------- | ---- | ------------------------------------------------------------ |
| ACCELEROMETER               | 1    | 加速度传感器。<br/>**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。 |
| GYROSCOPE                   | 2    | 陀螺仪传感器。<br/>**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。 |
| AMBIENT_LIGHT               | 5    | 环境光传感器。                                               |
| MAGNETIC_FIELD              | 6    | 磁场传感器。                                                 |
| BAROMETER                   | 8    | 气压计传感器。                                               |
| HALL                        | 10   | 霍尔传感器。                                                 |
| PROXIMITY                   | 12   | 接近光传感器。                                               |
| HUMIDITY                    | 13   | 湿度传感器。                                                 |
| ORIENTATION                 | 256  | 方向传感器。<br/>**原子化服务API**：从API version 11开始，该接口在支持原子化服务中使用。 |
| GRAVITY                     | 257  | 重力传感器。                                                 |
| LINEAR_ACCELEROMETER        | 258  | 线性加速度传感器。                                           |
| ROTATION_VECTOR             | 259  | 旋转矢量传感器。                                             |
| AMBIENT_TEMPERATURE         | 260  | 环境温度传感器。                                             |
| MAGNETIC_FIELD_UNCALIBRATED | 261  | 未校准磁场传感器。                                           |
| GYROSCOPE_UNCALIBRATED      | 263  | 未校准陀螺仪传感器。                                         |
| SIGNIFICANT_MOTION          | 264  | 有效运动传感器。                                             |
| PEDOMETER_DETECTION         | 265  | 计步检测传感器。                                             |
| PEDOMETER                   | 266  | 计步传感器。                                                 |
| HEART_RATE                  | 278  | 心率传感器。                                                 |
| WEAR_DETECTION              | 280  | 佩戴检测传感器。                                             |
| ACCELEROMETER_UNCALIBRATED  | 281  | 未校准加速度传感器。                                       |
| FUSION_PRESSURE<sup>22+</sup>             | 283  | 融合压力传感器。<br/>仅智能表有该传感器                        |


## Response

传感器数据的时间戳。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

| 名称      | 类型   | 只读 | 可选 | 说明                     |
| --------- | ------ | ---- | ---- | ------------------------ |
| timestamp | number | 否   | 否   | 传感器数据上报的时间戳。从设备开机开始计时到上报数据的时间，单位 : ns。 |
| accuracy<sup>11+</sup> | [SensorAccuracy](#sensoraccuracy11)<sup>11+</sup> | 否   | 否   | 传感器数据上报的精度挡位值。 |

## Options

设置传感器上报频率。

**原子化服务API**：从API version 11开始，该接口支持在原子化服务中使用。

**系统能力**：SystemCapability.Sensors.Sensor

| 名称     | 类型                                                        | 只读 | 可选 | 说明                                                                                         |
| -------- | ----------------------------------------------------------- | ---- | ---- |--------------------------------------------------------------------------------------------|
| interval | number\|[SensorFrequency](#sensorfrequency11)<sup>11+</sup> | 否   | 是   | 表示传感器的上报频率，默认值为200000000ns。该属性有最小值和最大值的限制，由硬件支持的上报频率决定，当设置频率大于最大值时以最大值上报数据，小于最小值时以最小值上报数据。 |
| sensorInfoParam<sup>19+</sup> | [SensorInfoParam](#sensorinfoparam19) | 否 | 是 | 传感器传入设置参数，可指定deviceId、sensorIndex。<br/>**原子化服务API**：从API version 19开始，该接口支持在原子化服务中使用。                                                         |
