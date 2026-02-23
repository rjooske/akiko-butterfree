<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<main>
  <h1>キーボードショートカット</h1>

  <section>
    <h2>共通</h2>
    <table>
      <thead>
        <tr>
          <th>キー</th>
          <th>動作</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <kbd>h</kbd>
            /
            <kbd>l</kbd>
          </td>
          <td>
            左のタブに移動 / 右のタブに移動（2023 ↔︎ 2024 ↔︎ 2025 ↔︎ プレビュー）
          </td>
        </tr>
        <tr>
          <td>
            <kbd>+</kbd>
            /
            <kbd>-</kbd>
          </td>
          <td>拡大 / 縮小</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>ピッカーモード</h2>
    <table>
      <thead>
        <tr>
          <th>キー</th>
          <th>動作</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <kbd>j</kbd>
            /
            <kbd>k</kbd>
          </td>
          <td>次のページ / 前のページ</td>
        </tr>
        <tr>
          <td><kbd>a</kbd></td>
          <td>現在のページをプレビューに使う</td>
        </tr>
        <tr>
          <td><kbd>d</kbd></td>
          <td>現在のページの角をクリア</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>プレビューモード</h2>
    <table>
      <thead>
        <tr>
          <th>キー</th>
          <th>動作</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <kbd>j</kbd>
            /
            <kbd>k</kbd>
          </td>
          <td>次のページを表示 / 前のページを表示</td>
        </tr>
        <tr>
          <td>
            <kbd>J</kbd>
            /
            <kbd>K</kbd>
          </td>
          <td>現在のページを下へ / 上へ</td>
        </tr>
        <tr>
          <td><kbd>d</kbd></td>
          <td>現在のページを削除</td>
        </tr>
        <tr>
          <td><kbd>o</kbd></td>
          <td>現在のページをピッカータブで開く</td>
        </tr>
        <tr>
          <td>
            <kbd>g</kbd>
            /
            <kbd>G</kbd>
          </td>
          <td>上端揃え / 下端揃え</td>
        </tr>
        <tr>
          <td><kbd>~</kbd></td>
          <td>1つ前のページに戻る</td>
        </tr>
      </tbody>
    </table>
  </section>

  <p class="back">
    <a href={resolve("/")}>← メイン画面に戻る</a>
  </p>
</main>

<style lang="scss">
  @use "sass:color";
  @use "../variables" as *;

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  :global(body) {
    background: $color-bg;
    color: $color-text;
    font-family: $font-sans;
  }

  main {
    max-width: 600px;
    margin: 0 auto;
    padding: $sp-lg;
  }

  h1 {
    font-size: $font-h1;
    font-weight: normal;
    margin: 0 0 $sp-lg;
  }

  h2 {
    font-size: 16px;
    font-weight: normal;
    margin: $sp-lg 0 $sp-sm;
    color: $color-text-muted;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: 4px;
    overflow: hidden;

    th,
    td {
      text-align: left;
      padding: $sp-sm $sp-md;
      border-bottom: 1px solid $color-border;
      font-size: 14px;
    }

    th {
      background: color.adjust($color-bg, $lightness: -3%);
      font-weight: normal;
      color: $color-text-muted;
      width: 120px;
    }

    tr:last-child td {
      border-bottom: none;
    }
  }

  kbd {
    display: inline-block;
    padding: 2px 6px;
    background: $color-bg;
    border: 1px solid $color-border;
    border-radius: 3px;
    font-family: $font-mono;
    font-size: 13px;
  }

  .back {
    margin-top: $sp-lg;

    a {
      color: $color-accent;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
</style>
