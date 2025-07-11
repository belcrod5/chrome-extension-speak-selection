# Speak Selection – 選択テキスト読み上げ拡張

> Speak Selectionは 選択したテキストを自然な音声で読み上げる。Google Chrome拡張機能です<br />
> 音声読み上げには AivisSpeechを利用しています。

## 主な機能

- 右クリック → **「選択したテキストを読み上げる」**
- 句読点・改行・連続スペースでテキストを分割して滑らかに再生
- 非同期キュー再生 ─ 文ごとに音声生成し順番に再生
- 再生中に新しい読み上げを開始すると自動的に前の再生を停止
- ポップアップ設定
  - *話者* / *スタイル* の選択
  - *速度* スライダー（0.5–2.0）
  - **テスト再生** と **停止** ボタン
- 完全オフライン動作（`http://127.0.0.1:10101` の AivisSpeech Engine にアクセス）

## 動作環境
> **要件: ローカルで <https://github.com/Aivis-Project/AivisSpeech-Engine> が提供する **AivisSpeech Engine** を起動している必要があります。**
> デフォルトでは `http://127.0.0.1:10101` へアクセスします。



## 開発／テスト用インストール手順

1. リポジトリをクローン

   ```bash
   git clone https://github.com/your-org/speak-selection.git
   cd speak-selection
   ```
2. AivisSpeech Engine をローカルで起動（デフォルトポート **10101**）
3. `chrome://extensions` を開き、右上 **デベロッパーモード** をオン
4. **「パッケージ化されていない拡張機能を読み込む」** をクリック → 本フォルダを選択
5. 任意のテキストを選択 → 右クリック → **読み上げ** 🎉

コードを変更したら拡張機能ページの **更新** を押せばすぐ反映されます。

## ファイル構成

```
.
├── background.js     # Service Worker（メニュー／音声合成）
├── contentScript.js  # 音声バッファを受信し順次再生
├── popup.html / js   # 設定 UI（話者・スタイル・速度）
├── manifest.json     # Chrome 拡張マニフェスト (MV3)
└── README.md         # このドキュメント
```

## 付与している権限

| Permission | 用途 |
|------------|------|
| `contextMenus` | 右クリックメニュー作成 |
| `activeTab` / `scripting` | 必要に応じて content script を注入 |
| `storage` | ユーザー設定（声・速度）の保存 |
| `host_permissions` (`http://127.0.0.1:10101/*`) | ローカル AivisSpeech Engine へのアクセス |

## ライセンス

MIT License

Copyright (c) 2024 belcrod5 (https://github.com/belcrod5)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. 