// Explicit selection from the public AHA-MEMES sample, not the gated full dataset.
// Keep original images and creator credits intact. See MEME-SOURCES.md.
export const memeSource = 'https://github.com/MohamedBayan/AHA-MEMES-sample';
const filenames = [
  '464009762_8368788083249217_9196851323009105373_n.jpg',
  '2020-12-02_17-10-00_UTC.jpg',
  '2023-07-10_17-38-07_UTC.jpg',
  '2019-04-29_16-07-32_UTC.jpg',
  '2021-03-06_00-16-11_UTC.jpg',
  '2019-01-24_22-02-52_UTC.jpg',
  '2022-03-30_22-17-37_UTC.jpg',
  '485063379_18265773040285358_7985404243280270729_n.jpg',
  '395028368_1011223776594765_1817227652396473933_n.jpg',
  '2021-12-20_21-14-58_UTC_3.jpg',
  '2020-08-02_10-19-59_UTC.jpg',
  '2022-10-17_13-00-27_UTC.jpg',
  '2022-07-31_13-40-45_UTC.jpg',
  '2023-05-08_19-40-02_UTC.jpg',
  '2022-04-23_22-06-13_UTC.jpg',
  '449290041_3720325338222474_3366490517108396543_n.jpeg',
  '2020-09-13_18-12-11_UTC.jpg',
  '2020-07-24_01-01-15_UTC.jpg',
  '457250559_1517071986356675_240962980474840764_n.jpg',
  '2023-05-12_23-51-17_UTC.jpg',
  '35344210_1722669167811101_4189508857992577024_n.jpg',
  '2019-07-27_13-34-27_UTC.jpg',
  '2021-12-25_19-56-16_UTC.jpg',
  '2019-04-25_10-40-37_UTC.jpg',
] as const;

export const sourceMemes = filenames.map(filename => ({
  id: `aha-${filename}`,
  filename,
  url: `https://raw.githubusercontent.com/MohamedBayan/AHA-MEMES-sample/main/data/img/${filename}`,
}));
