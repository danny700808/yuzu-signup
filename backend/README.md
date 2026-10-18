# 成果展排序後端

正式 Apps Script 專案：
https://script.google.com/home/projects/1_Nwj4TnO9GEBPvGLZPaMJQ66VO_RWZ2cSe1Oja-vzufWC7eGKdPqfHDO/edit

`scheduling.js` 是正式後端使用的純排序模組，可用 `node --test tests/*.test.js` 驗證。
GitHub Pages 只發布網頁；修改這個檔案後仍需將相同函式更新至 Apps Script 的「程式碼.gs」，儲存並在「管理部署作業」為既有部署選擇新版本。不要建立不同網址的替代部署。

2026-10-18 版本：`YUZU-SORT-2026-10-18-01`。

規則：

- 每場各自排序，報名時間與資料列次序決定同級優先順序。
- 完整團名／名單優先比對；多個姓名以頓號、逗號、分號、斜線或換行分隔。同組成員合併成一次需求。同名且無法確定對象時不猜測。
- 附近需求優先，目標為相差 1～3 位；前／後 10 組及明確「第4組～第7組」順位範圍其次。條件允許時偏好相差 3 位。
- 搜尋只接受整體優先序嚴格改善的結果，避免循環搬動。候選包含單組移動、交換及關聯群組移動；迭代有上限，不宣稱複雜衝突一定有解。
- 超額、找不到對象、指定時間或無法滿足的需求回報管理頁。時間需求無演出長度可用，不猜測實際時刻。
- 排序不寫回報名資料。公開節目 API 保持原欄位，不公開私人備註；只有已驗證密碼的管理 API 回傳診斷。

整合至原後端時，取代舊的 `normalizePairKey_`、`sortProgramSection_` 與其排序輔助函式，保留其餘報名、名額、音檔、通知信及資料讀寫函式。移除檔尾僅供 Node 測試的 `module.exports` 行。

管理 API 的每個項目另回傳 `front`、`back`、`scheduleWarnings`、`nearbyAssignments`、`rankPreference`，並在 `pushEntries` 內將 `order` 重設為 1，使每個場次編號與公開節目表一致。

此儲存庫不保存管理密碼、修改金鑰、聯絡資訊或完整報名資料。
