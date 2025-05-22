import nock from 'nock';
import { ZaptecApi } from './api';
import assert from 'assert';
import { ApiError } from './error';
import { ErrorCode } from './enums';

// Mock Homey object for tests
const mockHomey = {
  __: (key: string) => key
};

// Test data models
const testModels = {
  chargers: {
    pro: {
      "OperatingMode": 1,
      "IsOnline": true,
      "Id": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
      "MID": "ZPR000001",
      "DeviceId": "ZPR000001",
      "SerialNo": "Plass 1234",
      "Name": "Plass 1234",
      "CreatedOnDate": "2022-10-28T12:10:02.513",
      "CircuitId": "02122765-28c2-3d52-a533-daa42b1d1c2c",
      "Active": true,
      "CurrentUserRoles": 3,
      "DeviceType": 1,
      "InstallationName": "Boligsameie A",
      "InstallationId": "aa841220-c6ad-3318-a5c0-73476b86a781",
      "AuthenticationType": 2,
      "IsAuthorizationRequired": true
    },
    go: {
      "OperatingMode": 1,
      "IsOnline": true,
      "Id": "7861eb1a-e276-3024-a6e9-cad68e200c99",
      "MID": "ZAP000001",
      "DeviceId": "ZAP000001",
      "SerialNo": "Lader",
      "Name": "Lader",
      "CreatedOnDate": "2023-08-10T08:47:59.73",
      "CircuitId": "cca84503-4962-3618-ac0c-0be5a8860064",
      "Active": true,
      "CurrentUserRoles": 3,
      "Pin": "0000",
      "DeviceType": 4,
      "InstallationName": "Testveien 10",
      "InstallationId": "355d0c88-0bc8-3023-ab7c-2801a0c750b",
      "AuthenticationType": 0,
      "IsAuthorizationRequired": false
    }
  },
  
  allChargers: function() {
    return [this.chargers.pro, this.chargers.go];
  },
  
  state: [
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": -3,
            "Timestamp": "2025-05-20T07:03:20.54",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": -2,
            "Timestamp": "2025-05-07T12:07:06.443",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": -1,
            "Timestamp": "2025-05-21T20:21:28.24"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 1,
            "Timestamp": "2024-08-06T14:13:25.717",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 100,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "{\"ConnectorType\":\"ITT_Socket\",\"GridTypes\":[\"TN_1\",\"TN_3\",\"IT_1\",\"IT_3\"],\"HardwareVariant\":\"Costcut\",\"InternalFuse\":\"Resettable_C_40A\",\"MeterCalibrated\":true,\"MIDCertified\":false,\"ProductVariant\":\"Pro2\",\"RCDType\":\"TypeB\",\"SchemaVersion\":\"2.0\"}"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 110,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "Zaptec Pro"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 111,
            "Timestamp": "2024-11-06T11:34:26.847"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 120,
            "Timestamp": "2022-10-28T12:10:03.943",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 150,
            "Timestamp": "2024-10-21T14:28:06.45",
            "ValueAsString": "LTE"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 151,
            "Timestamp": "2025-04-11T06:06:16.1",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 152,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "PRO"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 153,
            "Timestamp": "2024-12-31T11:33:39.877",
            "ValueAsString": "0.5"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 154,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 155,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 156,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "devices.zaptec.com"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 170,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 201,
            "Timestamp": "2025-05-21T07:04:18.297",
            "ValueAsString": "26.756"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 202,
            "Timestamp": "2025-05-21T07:48:24.587",
            "ValueAsString": "22.2705"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 205,
            "Timestamp": "2025-05-21T04:01:55.16",
            "ValueAsString": "23.96"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 270,
            "Timestamp": "2025-04-21T05:04:23.797",
            "ValueAsString": "29.1428"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 280,
            "Timestamp": "2024-11-06T11:34:31.5"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 501,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "179.9095"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 502,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "4.7249"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 503,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "4.6171"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 507,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "0.0215"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 508,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "0.0301"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 509,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "0.026"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 510,
            "Timestamp": "2022-10-28T12:06:13.92",
            "ValueAsString": "32"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 511,
            "Timestamp": "2022-10-28T12:06:13.923",
            "ValueAsString": "6"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 513,
            "Timestamp": "2025-05-16T12:56:23.283",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 517,
            "Timestamp": "2024-11-06T11:20:05.493",
            "ValueAsString": "0.3746"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 519,
            "Timestamp": "2025-05-16T12:50:58.76",
            "ValueAsString": "5"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 522,
            "Timestamp": "2025-04-25T08:40:28.897",
            "ValueAsString": "8"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 523,
            "Timestamp": "2025-04-02T12:40:47.417",
            "ValueAsString": "16.17"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 540,
            "Timestamp": "2025-05-21T19:03:51.23",
            "ValueAsString": "8080~4"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 553,
            "Timestamp": "2025-05-16T13:07:45.803"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 554,
            "Timestamp": "2025-05-16T13:00:00.27",
            "ValueAsString": "OCMF|{\"FV\":\"1.0\",\"GI\":\"Zaptec Pro MID\",\"GV\":\"5.0.2.1\",\"PG\":\"F1\",\"MF\":\"v1.3.6\",\"RD\":[{\"TM\":\"2025-04-09T17:45:00,507+00:00 R\",\"RV\":2410.009,\"RI\":\"1-0:1.8.0\",\"RU\":\"kWh\",\"ST\":\"G\"}]}|{\"SA\":\"ECDSA-secp384r1-SHA256\",\"SE\":\"base64\",\"SD\":\"MGUCMQCO/fXTrIfjiIzIjkJjFGS4gL+Q8iDL3xqWJeJfu07pQS5rGJ/6YwT7VadaabdiM/ECMCL2iW0PuzeYIDDvvRe4cPxHSDwxLDCc6C3FA8xLQceUv5VugIXGLO8yHEzFEwodVg==\"}"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 555,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "900"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 708,
            "Timestamp": "2025-05-16T12:50:58.76",
            "ValueAsString": "32"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 710,
            "Timestamp": "2025-05-16T13:07:45.803",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 711,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 712,
            "Timestamp": "2022-10-28T12:06:13.923",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 714,
            "Timestamp": "2024-11-05T18:00:35.3",
            "ValueAsString": "32"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 715,
            "Timestamp": "2022-10-28T12:14:43.007",
            "ValueAsString": "2"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 716,
            "Timestamp": "2022-10-28T12:06:13.913",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 717,
            "Timestamp": "2022-10-28T12:14:37.657",
            "ValueAsString": "{\"AllowedNetworkTypes\":3}"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 718,
            "Timestamp": "2025-04-17T09:23:48.74",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 721,
            "Timestamp": "2025-05-16T13:07:45.803"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 722,
            "Timestamp": "2025-05-16T13:07:45.803"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 723,
            "Timestamp": "2025-05-16T13:07:52.657",
            "ValueAsString": "{\"SessionId\":\"fa5ac1a7-7125-4e4a-902f-97f06ef7e206\",\"Energy\":68.268,\"StartDateTime\":\"2025-05-13T18:35:44.744581Z\",\"EndDateTime\":\"2025-05-16T13:07:45.787898Z\",\"ReliableClock\":true,\"StoppedByRFID\":false,\"AuthenticationCode\":\"nfc-9A798939\",\"SignedSession\":\"OCMF|{\\\"FV\\\":\\\"1.0\\\",\\\"GI\\\":\\\"Zaptec Pro\\\",\\\"GS\\\":\\\"ZPR150119\\\",\\\"GV\\\":\\\"5.3.0.3\\\",\\\"PG\\\":\\\"T1\\\",\\\"MF\\\":\\\"v1.3.4\\\",\\\"IS\\\":true,\\\"IL\\\":\\\"HEARSAY\\\",\\\"IF\\\":[\\\"RFID_RELATED\\\"],\\\"IT\\\":\\\"ISO14443\\\",\\\"ID\\\":\\\"9A798939\\\",\\\"RD\\\":[{\\\"TM\\\":\\\"2025-05-13T18:35:44,723+00:00 R\\\",\\\"TX\\\":\\\"B\\\",\\\"RV\\\":6728.291,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"RU\\\":\\\"kWh\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T18:45:00,289+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6729.292,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T19:00:00,639+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6730.903,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T19:15:00,535+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6732.335,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T19:30:00,774+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6733.687,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T19:45:00,447+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6734.963,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T20:00:00,489+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6736.356,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T20:15:00,053+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6737.797,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T20:30:00,922+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6739.201,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T20:45:00,280+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6740.601,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T21:00:00,335+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6742.003,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T21:15:00,418+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6743.398,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T21:30:00,691+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6744.796,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T21:45:00,731+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6746.2,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T22:00:00,812+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6747.594,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T22:15:00,469+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6748.98,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T22:30:00,411+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6750.371,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T22:45:00,327+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6751.763,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T23:00:01,103+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6753.153,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T23:15:00,201+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6754.541,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T23:30:00,483+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6755.935,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-13T23:45:00,799+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6757.333,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T00:00:00,947+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6758.733,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T00:15:00,586+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6760.125,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T00:30:01,007+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6761.52,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T00:45:00,074+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6762.915,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T01:00:00,916+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6764.312,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T01:15:00,932+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6765.702,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T01:30:00,327+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6767.093,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T01:45:00,260+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6768.483,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T02:00:00,048+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6769.875,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T02:15:00,460+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6771.262,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T02:30:00,228+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6772.65,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T02:45:00,047+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6774.04,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T03:00:00,656+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6775.432,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T03:15:00,448+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6776.828,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T03:30:00,398+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6778.227,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T03:45:00,966+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6779.626,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T04:00:00,866+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6781.025,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T04:15:01,073+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6782.424,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T04:30:00,413+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6783.819,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T04:45:00,890+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6785.224,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T05:00:00,038+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6786.641,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T05:15:00,583+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6788.061,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T05:30:00,994+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6789.479,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T05:45:00,263+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6790.904,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T06:00:00,158+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6792.331,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T06:15:00,477+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6793.761,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T06:30:00,063+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6795.193,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-14T06:45:00,382+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6795.935,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-16T12:45:00,333+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6795.935,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-16T13:00:00,276+00:00 R\\\",\\\"TX\\\":\\\"T\\\",\\\"RV\\\":6796.559,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"},{\\\"TM\\\":\\\"2025-05-16T13:07:45,775+00:00 R\\\",\\\"TX\\\":\\\"E\\\",\\\"RV\\\":6796.559,\\\"RI\\\":\\\"1-0:1.8.0\\\",\\\"ST\\\":\\\"G\\\"}],\\\"ZS\\\":\\\"fa5ac1a7-7125-4e4a-902f-97f06ef7e206\\\"}\"}"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 750,
            "Timestamp": "2022-11-29T13:06:27.857",
            "ValueAsString": "dabd2769-bfdb-40ff-92ce-ba1b89cc7465;086F382B;Mobil "
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 751,
            "Timestamp": "2023-03-01T11:02:36.937",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 753,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 760,
            "Timestamp": "2024-11-06T11:34:26.847"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 761,
            "Timestamp": "2024-11-06T11:34:26.847",
            "ValueAsString": "Etc/UTC"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 762,
            "Timestamp": "2024-11-06T11:34:26.847"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 763,
            "Timestamp": "2024-11-06T11:34:26.837",
            "ValueAsString": ""
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 764,
            "Timestamp": "2024-11-06T11:34:26.847",
            "ValueAsString": "600"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 800,
            "Timestamp": "2025-04-25T07:45:30.5",
            "ValueAsString": "aa841220-c6ad-3318-a5c0-73476b86a781"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 801,
            "Timestamp": "2025-04-25T07:45:30.5",
            "ValueAsString": "default"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 803,
            "Timestamp": "2024-11-06T11:34:55.643",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 804,
            "Timestamp": "2024-11-06T11:35:14.237",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 805,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 807,
            "Timestamp": "2022-10-28T12:10:06.08"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 809,
            "Timestamp": "2025-05-21T10:36:45.723",
            "ValueAsString": "50"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 811,
            "Timestamp": "2025-04-21T05:04:19.597",
            "ValueAsString": "1"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 820,
            "Timestamp": "2025-05-21T05:22:10.347",
            "ValueAsString": "30.0132"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 823,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "8"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 854,
            "Timestamp": "2023-08-12T06:02:14.04",
            "ValueAsString": "{\"results\":70,\"raw_values\":[3775,3777,352],\"voltages\":[11.5,11.5,-12.5],\"cable_connected\":false,\"hardware\":5}"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 855,
            "Timestamp": "2024-11-06T11:34:26.847",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 856,
            "Timestamp": "2024-11-06T11:34:26.847",
            "ValueAsString": "0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 908,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "3.2.0.0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 909,
            "Timestamp": "2023-08-04T11:40:26.103",
            "ValueAsString": "132"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 911,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "5.3.0.3"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 912,
            "Timestamp": "2023-08-04T11:40:26.103",
            "ValueAsString": "3.2.3.0"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 913,
            "Timestamp": "2023-08-04T11:40:26.103",
            "ValueAsString": "Image 14.1, Linux 5.4.47-2.2.0+g01e468bfbca4 #1 SMP PREEMPT Wed Aug 11 09:50:19 UTC 2021"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 914,
            "Timestamp": "2024-11-06T11:34:53.517",
            "ValueAsString": "v1.3.4"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 920,
            "Timestamp": "2024-11-06T11:39:27.803",
            "ValueAsString": "TAURUS-1-G"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 921,
            "Timestamp": "2024-11-06T11:39:27.803",
            "ValueAsString": "IBIS-1-C"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 930,
            "Timestamp": "2024-11-06T11:34:31.5",
            "ValueAsString": ""
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 931,
            "Timestamp": "2024-11-06T11:34:31.5",
            "ValueAsString": ""
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 950,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "60:15:92:40:f4:fc"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 951,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "60:15:92:43:e5:5b"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 952,
            "Timestamp": "2022-10-28T12:10:06.08",
            "ValueAsString": "d8:10:68:f0:4d:92"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 953,
            "Timestamp": "2025-04-25T07:45:30.503",
            "ValueAsString": "60:15:92:49:e5:97"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 960,
            "Timestamp": "2022-10-28T12:10:06.083",
            "ValueAsString": "242016001557026"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 961,
            "Timestamp": "2022-10-28T12:10:06.083",
            "ValueAsString": "580011295423"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 962,
            "Timestamp": "2022-10-28T12:10:06.083",
            "ValueAsString": "89470060210811761924"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 963,
            "Timestamp": "2022-10-28T12:10:06.083",
            "ValueAsString": "867969062719990"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 964,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "BG96MAR02A07M1G_01.016.01.016"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 981,
            "Timestamp": "2024-11-06T11:34:26.86"
        },
        {
            "ChargerId": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
            "StateId": 982,
            "Timestamp": "2024-11-06T11:34:26.86",
            "ValueAsString": "82713"
        }
    ]
  ,
  
  auth: {
    token: 'VALID_TOKEN',
    type: 'Bearer',
    expires: 9000
  }
};

// Helper for setting up authentication nock
function mockAuthentication() {
  return nock('https://api.zaptec.com')
    .post('/oauth/token', 'grant_type=password&username=test&password=123')
    .reply(200, {
      access_token: testModels.auth.token,
      token_type: testModels.auth.type,
      expires_in: testModels.auth.expires,
    });
}

const api = new ZaptecApi('1.0.0', mockHomey);

describe('Zaptec API Client', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should use token after authentication', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.getChargers({});
  });

  it('should handle 429 responses with backoff', async () => {
    // First authenticate
    mockAuthentication();

    // First attempt gets 429
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(429, {}, { 'Retry-After': '1' });

    // Second attempt succeeds
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(200, { Data: [] });

    await api.authenticate('test', '123');
    const result = await api.getChargers({});
    
    assert.deepStrictEqual(result.Data, []);
  });

  it('should handle API errors correctly', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(500, { 
        Code: ErrorCode.ConfigurationError,
        Details: 'Something went wrong'
      });

    await api.authenticate('test', '123');
    
    try {
      await api.getChargers({});
      assert.fail('Expected error was not thrown');
    } catch (error) {
      assert(error instanceof ApiError);
      assert.strictEqual(error.message.includes('Configuration error'), true);
      assert.strictEqual(error.message.includes('Something went wrong'), true);
    }
  });

  it('should handle authentication failures', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=wrong&password=wrong')
      .reply(400, {
        error: 'invalid_grant',
        error_description: 'Invalid username or password'
      });

    try {
      await api.authenticate('wrong', 'wrong');
      assert.fail('Expected error was not thrown');
    } catch (error) {
      assert(error instanceof Error);
    }
  });

  it('should get chargers by model', async () => {
    mockAuthentication();
  
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .query(true)
      .times(3)
      .reply(200, { 
        Data: testModels.allChargers() 
      });

    await api.authenticate('test', '123');
    
    // Test Pro-model
    let result = await api.getChargersByModel('Pro');
    assert.strictEqual(result.Data?.length, 1);
    assert.strictEqual(result.Data?.[0].DeviceId, testModels.chargers.pro.DeviceId);

    // Test Go-model
    result = await api.getChargersByModel('Go');
    assert.strictEqual(result.Data?.length, 1);
    assert.strictEqual(result.Data?.[0].DeviceId, testModels.chargers.go.DeviceId);

    result = await api.getChargersByModel('Go2');
    assert.strictEqual(result.Data?.length, 0);
  });

  it('should fetch charger state correctly', async () => {
    mockAuthentication();

    const chargerId = testModels.chargers.pro.Id;
    
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get(`/api/chargers/${chargerId}/state`)
      .reply(200, testModels.state);

    await api.authenticate('test', '123');
    const state = await api.getChargerState(chargerId);
    
    assert.deepStrictEqual(state, testModels.state);
    assert.strictEqual(Array.isArray(state), true);
    assert.strictEqual(state.length, testModels.state.length);
    assert.strictEqual(state[0].ChargerId, chargerId);
  });

  it('should send command to charger correctly', async () => {
    mockAuthentication();

    const chargerId = testModels.chargers.pro.Id;
    
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .post(`/api/chargers/${chargerId}/sendCommand/2`) // Command 2 = StartCharging
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.sendCommand(chargerId, 2); // 2 = StartCharging
    // If we got here without error, the test passes
  });
  
});
