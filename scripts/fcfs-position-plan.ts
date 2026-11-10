import { positionBlueprintSchema, type PositionBlueprintInput } from '@torneos/shared';

type Game = PositionBlueprintInput['games'][number];
const dayDate: Record<number,string> = {
  3:'2026-11-24',4:'2026-11-26',5:'2026-11-27',6:'2026-12-01',7:'2026-12-03',8:'2026-12-04',9:'2026-12-10',
  10:'2026-12-11',11:'2026-12-12',12:'2026-12-15',13:'2026-12-17',14:'2026-12-18',
};
const groupRows: Array<[string,string,string,number|null]> = [
  ['F1','A1','A2',null],['F1','A4','A3',null],['F1','B1','B2',null],['F1','B4','B3',null],['F1','A5','B5',null],
  ['F2','A3','A1',3],['F2','A4','A5',3],['F2','B3','B1',3],['F2','B4','B5',4],['F2','A2','B2',4],
  ['F3','A1','A4',4],['F3','A5','A2',5],['F3','B1','B4',5],['F3','B5','B2',5],['F3','A3','B3',6],
  ['F4','A5','A1',6],['F4','A2','A3',6],['F4','B5','B1',7],['F4','B2','B3',7],['F4','A4','B4',7],
  ['F5','A2','A4',8],['F5','A3','A5',8],['F5','B2','B4',8],['F5','B3','B5',9],['F5','A1','B1',9],
];
const groupGames: Game[] = groupRows.map(([sportingRound,homeRef,awayRef,jornadaNo],index)=>({
  code:`G${String(index+1).padStart(2,'0')}`,stage:'groups',sportingRound,jornadaNo,plannedDate:jornadaNo===null?null:dayDate[jornadaNo],homeRef,awayRef,
}));
const laterGames: Game[] = [
  {code:'MM1',stage:'quarterfinal',sportingRound:'Cuartos',jornadaNo:10,plannedDate:dayDate[10],homeRef:'1A',awayRef:'4B'},
  {code:'MM4',stage:'quarterfinal',sportingRound:'Cuartos',jornadaNo:10,plannedDate:dayDate[10],homeRef:'2B',awayRef:'3A'},
  {code:'MM2',stage:'quarterfinal',sportingRound:'Cuartos',jornadaNo:11,plannedDate:dayDate[11],homeRef:'1B',awayRef:'4A'},
  {code:'MM3',stage:'quarterfinal',sportingRound:'Cuartos',jornadaNo:11,plannedDate:dayDate[11],homeRef:'2A',awayRef:'3B'},
  {code:'Q1',stage:'quadrangular',sportingRound:'Cuadrangular 1',jornadaNo:12,plannedDate:dayDate[12],homeRef:'S1',awayRef:'S4'},
  {code:'Q2',stage:'quadrangular',sportingRound:'Cuadrangular 1',jornadaNo:12,plannedDate:dayDate[12],homeRef:'S2',awayRef:'S3'},
  {code:'Q3',stage:'quadrangular',sportingRound:'Cuadrangular 2',jornadaNo:13,plannedDate:dayDate[13],homeRef:'S1',awayRef:'S3'},
  {code:'Q4',stage:'quadrangular',sportingRound:'Cuadrangular 2',jornadaNo:13,plannedDate:dayDate[13],homeRef:'S2',awayRef:'S4'},
  {code:'Q5',stage:'quadrangular',sportingRound:'Cuadrangular 3',jornadaNo:14,plannedDate:dayDate[14],homeRef:'S1',awayRef:'S2'},
  {code:'Q6',stage:'quadrangular',sportingRound:'Cuadrangular 3',jornadaNo:14,plannedDate:dayDate[14],homeRef:'S3',awayRef:'S4'},
];

export const fcfsPositionPlan = positionBlueprintSchema.parse({
  name:'Copa Caacupé 2026',
  opening:{firstJornada:1,secondJornada:2,firstDate:'2026-11-17',secondDate:'2026-11-19'},
  extraReservedDate:'2026-12-22',
  games:[...groupGames,...laterGames],
});
