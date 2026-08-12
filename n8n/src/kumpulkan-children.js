// Kumpulkan id container anak jadi satu daftar untuk container CAROUSEL.
// Node IG memakai onError:continueRegularOutput supaya satu slide gagal tidak
// mematikan eksekusi — tapi carousel dengan slide bolong jangan diterbitkan.
const items = $input.all();
const ids = items.map((i) => i.json && i.json.id).filter(Boolean);

if (ids.length !== items.length) {
  const gagal = items.filter((i) => !(i.json && i.json.id));
  throw new Error(
    `${ids.length}/${items.length} item container IG berhasil. Contoh error: ` +
      JSON.stringify(gagal[0] && gagal[0].json).slice(0, 400)
  );
}
if (ids.length < 2) throw new Error(`Carousel IG butuh minimal 2 anak, dapat ${ids.length}.`);

return [{ json: { children: ids.join(','), jumlah: ids.length } }];
